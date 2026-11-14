#!/usr/bin/env python3
"""Generate an offline, explicitly selected local-volume migration plan; never calls kubectl."""
import argparse
import copy
import json
from pathlib import Path
import re


def metadata(obj):
    """Keep ownership by Helm, not API identity, binding or stale GC references."""
    old = obj['metadata']
    annotations = {
        k: v for k, v in old.get('annotations', {}).items()
        if not k.startswith(('pv.kubernetes.io/', 'volume.kubernetes.io/'))
        and k != 'kubectl.kubernetes.io/last-applied-configuration'
    }
    return {'name': old['name'], 'namespace': 'telemetry',
            'labels': old.get('labels', {}), 'annotations': annotations}


def plan(claims, volumes, selected, target_hostname, target_root):
    if not selected or len(selected) != len(set(selected)):
        raise ValueError('Select one or more distinct --claim names after reviewing the inventory')
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]*', target_hostname):
        raise ValueError('Invalid target kubernetes.io/hostname value')
    if not target_root.startswith('/') or '..' in Path(target_root).parts or any(c in target_root for c in '\t\r\n'):
        raise ValueError('Target root must be an absolute path without parent traversal')
    by_claim = {c['metadata']['name']: c for c in claims['items']
                if c['metadata'].get('namespace') == 'telemetry'}
    by_volume = {v['metadata']['name']: v for v in volumes['items']}
    new_volumes, new_claims, rollback_claims, rows = [], [], [], []
    for name in selected:
        if not re.fullmatch(r'[a-z0-9][a-z0-9.-]*', name) or len(name) > 230:
            raise ValueError('Invalid or too long claim name')
        claim = by_claim[name]
        if claim.get('status', {}).get('phase') != 'Bound':
            raise ValueError(f'{name}: source claim must be Bound')
        old_spec = claim['spec']
        volume = by_volume[old_spec['volumeName']]
        spec = volume['spec']
        ref = spec.get('claimRef', {})
        if (ref.get('uid') != claim['metadata']['uid'] or ref.get('name') != name
                or ref.get('namespace') != 'telemetry'):
            raise ValueError(f'{name}: claimRef does not match exported PVC')
        source = spec.get('local', spec.get('hostPath', {})).get('path')
        if (not source or not source.startswith('/') or any(c in source for c in '\t\r\n')
                or spec.get('volumeMode', 'Filesystem') != 'Filesystem'):
            raise ValueError(f'{name}: only node-local filesystem volumes are supported')
        terms = spec.get('nodeAffinity', {}).get('required', {}).get('nodeSelectorTerms', [])
        hosts = []
        for term in terms:
            expressions = term.get('matchExpressions', [])
            if (len(expressions) != 1 or expressions[0].get('key') != 'kubernetes.io/hostname'
                    or expressions[0].get('operator') != 'In' or term.get('matchFields')):
                raise ValueError(f'{name}: inspect unsupported source affinity manually')
            hosts.extend(expressions[0].get('values', []))
        if len(set(hosts)) != 1 or hosts[0] == target_hostname:
            raise ValueError(f'{name}: expected one source hostname different from destination')
        target_name = 'madrid-telemetry-' + name
        target_path = str(Path(target_root) / name)
        storage_class = old_spec.get('storageClassName', '')
        if storage_class != spec.get('storageClassName', ''):
            raise ValueError(f'{name}: PVC/PV storage class mismatch')
        new_volumes.append({'apiVersion': 'v1', 'kind': 'PersistentVolume',
            'metadata': {'name': target_name}, 'spec': {
                'capacity': copy.deepcopy(spec['capacity']),
                'accessModes': copy.deepcopy(old_spec['accessModes']),
                'volumeMode': 'Filesystem', 'storageClassName': storage_class,
                'persistentVolumeReclaimPolicy': 'Retain',
                'hostPath': {'path': target_path, 'type': 'Directory'},
                'nodeAffinity': {'required': {'nodeSelectorTerms': [{'matchExpressions': [{
                    'key': 'kubernetes.io/hostname', 'operator': 'In', 'values': [target_hostname]
                }]}]}},
                'claimRef': {'namespace': 'telemetry', 'name': name}}})
        for destination, binding in ((new_claims, target_name), (rollback_claims, old_spec['volumeName'])):
            destination.append({'apiVersion': 'v1', 'kind': 'PersistentVolumeClaim',
                'metadata': metadata(claim), 'spec': {
                    'accessModes': copy.deepcopy(old_spec['accessModes']),
                    'resources': copy.deepcopy(old_spec['resources']),
                    'volumeMode': 'Filesystem', 'storageClassName': storage_class,
                    'volumeName': binding}})
        rows.append([name, old_spec['volumeName'], hosts[0], source, target_name, target_path])
    return new_volumes, new_claims, rollback_claims, rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pvcs', type=Path, required=True)
    parser.add_argument('--pvs', type=Path, required=True)
    parser.add_argument('--claim', action='append', required=True)
    parser.add_argument('--target-hostname', required=True)
    parser.add_argument('--target-root', default='/k3s-cluster/volumes/telemetry-migration')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = plan(json.loads(args.pvcs.read_text()), json.loads(args.pvs.read_text()),
                  args.claim, args.target_hostname, args.target_root)
    args.output.mkdir(parents=True, exist_ok=False)
    for filename, items in zip(('target-volumes.json', 'target-claims.json', 'rollback-claims.json'), result[:3]):
        (args.output / filename).write_text(json.dumps({'apiVersion': 'v1', 'kind': 'List', 'items': items}, indent=2) + '\n')
    header = ['claim', 'source_pv', 'source_hostname', 'source_path', 'target_pv', 'target_path']
    (args.output / 'volumes.tsv').write_text('\n'.join('\t'.join(row) for row in [header, *result[3]]) + '\n')
    print(f'Generated {len(result[3])} volume plans in {args.output}; no cluster or data changes made')


if __name__ == '__main__':
    main()
