import {
    readFileSync, renameSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { createCertificates } from './certificates.ts';
import { createMitmProxy, type LogEntry } from './proxy.ts';
import { parseRules } from './rules.ts';

// Only containers of the same pod reach 127.0.0.1.
const PORT = 3128;
// Shared with the agent containers, read-only there. Holds only public certificates.
const SHARED_FOLDER = '/mitm-proxy';
// The system CAs of this image. The bundle for clients is these plus the proxy CA, so the
// tunneled hosts are verified as usual.
const SYSTEM_CA_BUNDLE = '/etc/ssl/certs/ca-certificates.crt';

function log(entry: LogEntry): void {
    process.stdout.write(`${JSON.stringify({
        time: new Date().toISOString(),
        ...entry,
    })}\n`);
}

const rulesJson = process.env.MITM_RULES;

if (!rulesJson) {
    throw new Error('MITM_RULES is required');
}

const rules = parseRules(rulesJson, process.env);
const certificates = createCertificates([...rules.keys()]);

// Written before the port opens: the startup probe checks the port, then the agent container starts.
const bundle = path.join(SHARED_FOLDER, 'ca-bundle.crt');

writeFileSync(`${bundle}.tmp`, `${readFileSync(SYSTEM_CA_BUNDLE, 'utf8')}\n${certificates.caCertificate}`);
renameSync(`${bundle}.tmp`, bundle);

createMitmProxy({
    rules,
    certificates,
    log,
}).listen(PORT, '127.0.0.1', () => {
    log({
        event: 'listening',
        port: PORT,
        hosts: [...rules.keys()].join(','),
    });
});

process.on('SIGTERM', () => process.exit(0));
