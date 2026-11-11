// Real Helm rendering: these integration cases deliberately exercise subprocesses.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
    mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

import { load, loadAll } from 'js-yaml';

const chart = 'provisioning/helm/senaev-com';
const defaults = load(readFileSync(`${chart}/values.yaml`, 'utf8'));
const { personal } = defaults.codingAgentInstances;

/** Render real Helm manifests with temporary instance overrides, cleaning up on failure. */
function render(instances) {
    const temp = mkdtempSync(join(tmpdir(), 'coding-agents-'));

    try {
        const override = join(temp, 'values.json');

        writeFileSync(override, JSON.stringify({ codingAgentInstances: instances }));

        return spawnSync('helm', [
            'template',
            'senaev-com',
            chart,
            '-n',
            'senaev-com',
            '-f',
            'provisioning/helm/common-values.yaml',
            '-f',
            `${chart}/values.yaml`,
            '-f',
            override,
        ], {
            cwd: resolve(import.meta.dirname, '..'),
            encoding: 'utf8',
        });
    } finally {
        rmSync(temp, {
            recursive: true,
            force: true,
        });
    }
}

/** Parse a successful render and reject duplicate Kubernetes resource identities. */
function documents(instances) {
    const result = render(instances);

    assert.equal(result.status, 0, result.stderr);
    const docs = loadAll(result.stdout).filter(Boolean);
    const identities = docs.map((doc) => `${doc.kind}/${doc.metadata.namespace}/${doc.metadata.name}`);

    assert.equal(new Set(identities).size, identities.length, 'duplicate Kubernetes resource identity');

    return docs;
}

/** Build an isolated second-instance fixture without personal MCPs or credential references. */
function family() {
    const instance = structuredClone(personal);

    instance.resourcePrefix = 'family-';
    instance.owner = {
        name: 'Family',
        email: 'family@example.com',
    };
    instance.opencode.vps = 'new-vps';
    instance.opencode.dataPath = '/k3s-cluster/volumes/family-opencode';
    instance.opencode.hostname = 'opencode.example.ru';
    instance.opencode.ingressName = 'family-opencode';
    instance.opencode.mcpOAuth.hostname = 'opencode.example.ru';
    instance.ompWeb.hostname = 'omp.example.ru';
    instance.ingress.className = 'traefik-ru';
    instance.ingress.traefikDeployment = 'ru-node';
    instance.secrets.name = 'family-credentials';
    instance.secrets.vaultPath = 'family-kv';
    for (const key of [
        'opencodePassword',
        'ompHtpasswd',
        'githubToken',
        'sshPrivateKey',
        'telegramToken',
        'telegramAllowedUser',
    ]) {
        instance.secrets[key] = `FAMILY_${key}`;
    }

    instance.agent = JSON.parse(readFileSync(`${chart}/${instance.agentConfigFile}`, 'utf8'));
    delete instance.agentConfigFile;
    instance.agent.mcp = {};
    instance.agent.connectors.openrouter.secretKey = 'FAMILY_OPENROUTER';
    instance.agent.speechToText.secretKey = 'FAMILY_GROQ';
    instance.codeTools.enabled = false;

    return instance;
}

/** Find a required rendered resource, reporting its kind and name when absent. */
const get = (docs, kind, name) => {
    const doc = docs.find((item) => item.kind === kind && item.metadata.name === name);

    assert.ok(doc, `missing ${kind}/${name}`);

    return doc;
};

/** Verify an instance's volume, service, ingress and authentication resource references. */
function checkReferences(docs, prefix) {
    for (const name of [
        'opencode-telegram',
        'omp-web',
    ]) {
        const pod = get(docs, 'Deployment', `${prefix}${name}`).spec.template;
        const availableVolumes = new Set(pod.spec.volumes.map((volume) => volume.name));

        for (const container of [
            ...pod.spec.initContainers ?? [],
            ...pod.spec.containers,
        ]) {
            for (const mount of container.volumeMounts ?? []) {
                assert.ok(availableVolumes.has(mount.name), `unknown volume ${mount.name}`);
            }
        }

        for (const volume of pod.spec.volumes) {
            if (volume.persistentVolumeClaim) {
                get(docs, 'PersistentVolumeClaim', volume.persistentVolumeClaim.claimName);
            }

            if (volume.configMap) {
                get(docs, 'ConfigMap', volume.configMap.name);
            }
        }
    }

    for (const service of docs.filter((doc) => doc.kind === 'Service' && [
        'opencode',
        'opencode-mcp-oauth',
        'omp-web',
        'code-tools',
    ].map((name) => `${prefix}${name}`).includes(doc.metadata.name))) {
        const deployment = get(docs, 'Deployment', service.spec.selector.app);
        const pod = deployment.spec.template;

        assert.equal(pod.metadata.labels.app, service.spec.selector.app);
        for (const port of service.spec.ports) {
            assert.ok(
                pod.spec.containers.some((container) =>
                    (container.ports ?? []).some((entry) => entry.name === port.targetPort || entry.containerPort === port.targetPort)),
                `unreachable Service port: ${service.metadata.name}`
            );
        }
    }

    for (const ingress of docs.filter((doc) => doc.kind === 'Ingress' && [
        `${prefix}opencode-mcp-oauth`,
        `${prefix}omp-web`,
        prefix ? `${prefix}opencode` : 'senaev-com-opencode',
    ].includes(doc.metadata.name))) {
        for (const rule of ingress.spec.rules) {
            for (const path of rule.http.paths) {
                get(docs, 'Service', path.backend.service.name);
            }
        }
    }

    const middleware = get(docs, 'Middleware', `${prefix}omp-web-basicauth`);

    get(docs, 'ExternalSecret', middleware.spec.basicAuth.secret);
}

test('existing instance preserves names, node, PVC identities and state directory', () => {
    const docs = documents({});
    const pod = get(docs, 'Deployment', 'opencode-telegram').spec.template.spec;

    assert.deepEqual(pod.nodeSelector, { vps: 'hetzner' });
    assert.equal(pod.volumes.find((volume) => volume.name === 'opencode-data').hostPath.path, '/k3s-cluster/volumes/opencode-data');
    assert.equal(get(docs, 'PersistentVolumeClaim', 'opencode-telegram-git').spec.resources.requests.storage, '16Gi');
    assert.equal(get(docs, 'PersistentVolumeClaim', 'omp-web-state').spec.resources.requests.storage, '8Gi');
    get(docs, 'Deployment', 'code-tools');
    get(docs, 'Ingress', 'senaev-com-opencode');
    checkReferences(docs, '');
});

test('two instances isolate nodes, routes, selectors, credentials and data without Code Tools for family', () => {
    const docs = documents({ family: family() });

    checkReferences(docs, 'family-');
    assert.ok(!docs.some((doc) => doc.metadata.name === 'family-code-tools'));
    for (const name of [
        'family-opencode-telegram',
        'family-omp-web',
    ]) {
        const deployment = get(docs, 'Deployment', name);
        const pod = deployment.spec.template.spec;

        assert.deepEqual(pod.nodeSelector, { vps: 'new-vps' });
        assert.deepEqual(deployment.spec.selector.matchLabels, { app: name });
        for (const container of pod.containers) {
            for (const env of container.env ?? []) {
                const ref = env.valueFrom?.secretKeyRef;

                if (ref) {
                    assert.ok([
                        'family-credentials',
                        'family-opencode-auth',
                    ].includes(ref.name), ref.name);
                }
            }
        }
    }

    const pod = get(docs, 'Deployment', 'family-opencode-telegram').spec.template.spec;

    assert.equal(pod.volumes.find((volume) => volume.name === 'opencode-data').hostPath.path, '/k3s-cluster/volumes/family-opencode');
    const { env } = pod.containers.find((container) => container.name === 'opencode-serve');

    assert.equal(env.find((item) => item.name === 'OPENROUTER_API_KEY').valueFrom.secretKeyRef.key, 'FAMILY_OPENROUTER');
    assert.deepEqual(JSON.parse(env.find((item) => item.name === 'OPENCODE_CONFIG_CONTENT').value).mcp.servers, {});
    const bot = pod.containers.find((container) => container.name === 'opencode-telegram-bot');

    assert.equal(bot.env.find((item) => item.name === 'TELEGRAM_BOT_TOKEN').valueFrom.secretKeyRef.key, 'FAMILY_telegramToken');
    for (const name of [
        'family-opencode',
        'family-opencode-mcp-oauth',
        'family-omp-web',
    ]) {
        assert.equal(get(docs, 'Ingress', name).spec.ingressClassName, 'traefik-ru');
    }

    for (const name of [
        'family-opencode-telegram',
        'family-omp-web',
    ]) {
        const source = get(docs, 'NetworkPolicy', name).spec.ingress[0].from[0];

        assert.equal(source.podSelector.matchLabels['traefik-deployment'], 'ru-node');
    }

    const { affinity } = get(docs, 'Deployment', 'family-omp-web').spec.template.spec;

    assert.equal(affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution[0].labelSelector.matchLabels.app, 'family-opencode-telegram');
    assert.equal(get(docs, 'ExternalSecret', 'family-opencode-auth').spec.data[0].remoteRef.key, 'family-kv');
    assert.equal(get(docs, 'Deployment', 'opencode-telegram').spec.template.spec.nodeSelector.vps, 'hetzner');
});

test('OAuth callback and optional Code Tools follow their own instance', () => {
    const instance = family();

    instance.agent.mcp.example = {
        url: 'https://mcp.example.com',
        oauth: {},
    };
    instance.codeTools.enabled = true;
    instance.secrets.codeToolsToken = 'FAMILY_CODE_TOOLS';
    const docs = documents({ family: instance });
    const pod = get(docs, 'Deployment', 'family-opencode-telegram').spec.template.spec;
    const config = JSON.parse(pod.containers[0].env.find((item) => item.name === 'OPENCODE_CONFIG_CONTENT').value);

    assert.equal(config.mcp.servers.example.oauth.redirect_uri, 'https://opencode.example.ru/auth/mcp/callback');
    const tools = get(docs, 'Deployment', 'family-code-tools').spec.template.spec;

    assert.equal(tools.volumes.find((volume) => volume.name === 'projects-git').persistentVolumeClaim.claimName, 'family-opencode-telegram-git');
    assert.equal(tools.containers[0].env.find((item) => item.name === 'INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS').valueFrom.secretKeyRef.key, 'FAMILY_CODE_TOOLS');
});

for (const [
    name,
    modify,
    expected,
] of [
        [
            'duplicate prefix',
            (instance) => {
                instance.resourcePrefix = '';
            },
            'distinct resourcePrefix',
        ],
        [
            'shared state directory',
            (instance) => {
                instance.opencode.dataPath = personal.opencode.dataPath;
            },
            'non-overlapping',
        ],
        [
            'nested state directory',
            (instance) => {
                instance.opencode.dataPath = `${personal.opencode.dataPath}/child`;
            },
            'non-overlapping',
        ],
        [
            'shared web hostname',
            (instance) => {
                instance.ompWeb.hostname = personal.ompWeb.hostname;
            },
            'distinct web hostnames',
        ],
        [
            'shared ingress name',
            (instance) => {
                instance.opencode.ingressName = personal.opencode.ingressName;
            },
            'distinct opencode.ingressName',
        ],
    ]) {
    test(`rejects ${name}`, () => {
        const instance = family();

        modify(instance);
        const result = render({ family: instance });

        assert.notEqual(result.status, 0);
        assert.ok(result.stderr.includes(expected), result.stderr);
    });
}

test('rejects incomplete instances rather than inheriting personal credentials', () => {
    const instance = family();

    delete instance.secrets.telegramToken;
    const result = render({ family: instance });

    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes('telegramToken'), result.stderr);
});

test('rejects missing instruction files and missing Code Tools authentication', () => {
    const instance = family();

    instance.instructionsPath = 'config/missing-family-rules';
    assert.notEqual(render({ family: instance }).status, 0);
    instance.instructionsPath = personal.instructionsPath;
    instance.codeTools.enabled = true;
    delete instance.secrets.codeToolsToken;
    const result = render({ family: instance });

    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes('Code Tools requires secrets.codeToolsToken'), result.stderr);
});
