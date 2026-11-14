"""Safety properties for offline volume migration; run with unittest discovery."""
import copy
import unittest
from telemetry_volume_plan import plan


class VolumePlanTest(unittest.TestCase):
    def setUp(self):
        self.claim = {'metadata': {'name': 'grafana', 'namespace': 'telemetry', 'uid': 'old-uid',
            'ownerReferences': [{'uid': 'stale-owner'}], 'annotations': {
                'meta.helm.sh/release-name': 'vm-stack',
                'pv.kubernetes.io/bind-completed': 'yes',
                'volume.kubernetes.io/selected-node': 'hetzner'}},
            'status': {'phase': 'Bound'}, 'spec': {'volumeName': 'source',
                'accessModes': ['ReadWriteOnce'], 'storageClassName': 'local-path',
                'resources': {'requests': {'storage': '1Gi'}}}}
        self.volume = {'metadata': {'name': 'source'}, 'spec': {
            'capacity': {'storage': '1Gi'}, 'storageClassName': 'local-path',
            'hostPath': {'path': '/old/data'}, 'claimRef': {
                'uid': 'old-uid', 'namespace': 'telemetry', 'name': 'grafana'},
            'nodeAffinity': {'required': {'nodeSelectorTerms': [{'matchExpressions': [{
                'key': 'kubernetes.io/hostname', 'operator': 'In', 'values': ['hetzner']}]}]}}}}

    def generate(self, selected=None):
        return plan({'items': [self.claim]}, {'items': [self.volume]},
                    ['grafana'] if selected is None else selected, 'senaev-madrid', '/new/data')

    def test_new_binding_retains_source_identity_and_data(self):
        before = copy.deepcopy((self.claim, self.volume))
        pvs, claims, rollback, rows = self.generate()
        self.assertEqual((self.claim, self.volume), before)
        self.assertEqual(pvs[0]['spec']['persistentVolumeReclaimPolicy'], 'Retain')
        self.assertEqual(pvs[0]['spec']['hostPath'], {'path': '/new/data/grafana', 'type': 'Directory'})
        self.assertEqual(pvs[0]['spec']['claimRef'], {'namespace': 'telemetry', 'name': 'grafana'})
        self.assertEqual(claims[0]['spec']['volumeName'], pvs[0]['metadata']['name'])
        self.assertEqual(rollback[0]['spec']['volumeName'], 'source')
        self.assertEqual(claims[0]['metadata']['annotations'], {'meta.helm.sh/release-name': 'vm-stack'})
        self.assertNotIn('uid', claims[0]['metadata'])
        self.assertNotIn('ownerReferences', claims[0]['metadata'])
        self.assertEqual(rows[0][2:4], ['hetzner', '/old/data'])

    def test_rejects_stale_export(self):
        self.volume['spec']['claimRef']['uid'] = 'different-uid'
        with self.assertRaisesRegex(ValueError, 'claimRef'):
            self.generate()

    def test_rejects_network_storage(self):
        self.volume['spec'].pop('hostPath')
        self.volume['spec']['nfs'] = {'server': 'server', 'path': '/data'}
        with self.assertRaisesRegex(ValueError, 'node-local'):
            self.generate()

    def test_rejects_ambiguous_affinity(self):
        self.volume['spec']['nodeAffinity']['required']['nodeSelectorTerms'][0]['matchExpressions'][0]['values'].append('other')
        with self.assertRaisesRegex(ValueError, 'one source'):
            self.generate()

    def test_rejects_unbound_claim(self):
        self.claim['status']['phase'] = 'Pending'
        with self.assertRaisesRegex(ValueError, 'Bound'):
            self.generate()

    def test_rejects_duplicate_or_empty_selection(self):
        for selected in ([], ['grafana', 'grafana']):
            with self.assertRaisesRegex(ValueError, 'distinct'):
                self.generate(selected)

    def test_rejects_other_namespace(self):
        self.claim['metadata']['namespace'] = 'other'
        with self.assertRaises(KeyError):
            self.generate()


if __name__ == '__main__':
    unittest.main()
