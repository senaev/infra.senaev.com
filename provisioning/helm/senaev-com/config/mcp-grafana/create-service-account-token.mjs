// Init container of the mcp-grafana pod. Grafana cannot create service accounts from
// provisioning files, so this makes sure the service account exists with its role, gives
// it a new token for this pod, and deletes its older tokens. It never logs a secret.
//
// With TOKEN_CHECK_INTERVAL_SECONDS it is the sidecar instead: it checks the token in a loop
// and makes a new one when Grafana rejects it, for example after Grafana lost its database.
// mcp-grafana reads the token file on every call, so it needs no restart. A liveness probe
// cannot do this: a container restart does not run the init container again.
import {
    readFile, rename, writeFile,
} from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const GRAFANA_URL = requireEnv('GRAFANA_URL');
const ADMIN_USER = requireEnv('GRAFANA_ADMIN_USER');
const ADMIN_PASSWORD = requireEnv('GRAFANA_ADMIN_PASSWORD');
const SERVICE_ACCOUNT_NAME = requireEnv('SERVICE_ACCOUNT_NAME');
const SERVICE_ACCOUNT_ROLE = requireEnv('SERVICE_ACCOUNT_ROLE');
const TOKEN_FILE = requireEnv('TOKEN_FILE');
const TOKEN_CHECK_INTERVAL_SECONDS = Number(process.env.TOKEN_CHECK_INTERVAL_SECONDS ?? 0);

// On a new cluster, this chart can start before Grafana.
const HEALTH_RETRY_INTERVAL_MS = 5_000;
const HEALTH_TIMEOUT_MS = 10 * 60_000;

const AUTHORIZATION = `Basic ${Buffer.from(`${ADMIN_USER}:${ADMIN_PASSWORD}`).toString('base64')}`;

function requireEnv(name) {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

function log(message, details = {}) {
    process.stdout.write(`${JSON.stringify({
        time: new Date().toISOString(),
        msg: message,
        ...details,
    })}\n`);
}

async function callGrafana(method, path, body) {
    const response = await fetch(`${GRAFANA_URL}${path}`, {
        method,
        headers: {
            authorization: AUTHORIZATION,
            ...(body !== undefined && { 'content-type': 'application/json' }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
        // The error body of these endpoints holds no secret, unlike a successful token response.
        throw new Error(`Grafana ${method} ${path} failed with ${response.status}: ${await response.text()}`);
    }

    return response.status === 204 ? undefined : response.json();
}

async function waitForGrafana() {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;

    while (true) {
        try {
            const response = await fetch(`${GRAFANA_URL}/api/health`);

            if (response.ok) {
                return;
            }

            log('⏳ Grafana is not healthy yet', { status: response.status });
        } catch (error) {
            log('⏳ Grafana is not reachable yet', { error: error.message });
        }

        if (Date.now() > deadline) {
            throw new Error(`Grafana is not healthy after ${HEALTH_TIMEOUT_MS / 60_000} minutes`);
        }

        await sleep(HEALTH_RETRY_INTERVAL_MS);
    }
}

async function findOrCreateServiceAccount() {
    const { serviceAccounts } = await callGrafana('GET', `/api/serviceaccounts/search?query=${encodeURIComponent(SERVICE_ACCOUNT_NAME)}`);
    // The search is a substring match.
    const existing = serviceAccounts.find(({ name }) => name === SERVICE_ACCOUNT_NAME);

    if (existing === undefined) {
        const created = await callGrafana('POST', '/api/serviceaccounts', {
            name: SERVICE_ACCOUNT_NAME,
            role: SERVICE_ACCOUNT_ROLE,
        });

        log('✅ Service account created', {
            id: created.id,
            role: SERVICE_ACCOUNT_ROLE,
        });

        return created.id;
    }

    if (existing.role !== SERVICE_ACCOUNT_ROLE) {
        await callGrafana('PATCH', `/api/serviceaccounts/${existing.id}`, { role: SERVICE_ACCOUNT_ROLE });
        log('✅ Service account role changed', {
            id: existing.id,
            from: existing.role,
            to: SERVICE_ACCOUNT_ROLE,
        });
    }

    return existing.id;
}

// mcp-grafana can read the file at any moment, so it must never see a half-written token.
async function writeTokenFile(key) {
    const temporaryFile = `${TOKEN_FILE}.tmp`;

    await writeFile(temporaryFile, key, { mode: 0o600 });
    await rename(temporaryFile, TOKEN_FILE);
}

async function createToken() {
    const serviceAccountId = await findOrCreateServiceAccount();
    const oldTokens = await callGrafana('GET', `/api/serviceaccounts/${serviceAccountId}/tokens`);

    // Token names must be unique within the service account.
    const tokenName = `${SERVICE_ACCOUNT_NAME}-${Date.now()}`;
    const { id: tokenId, key } = await callGrafana('POST', `/api/serviceaccounts/${serviceAccountId}/tokens`, { name: tokenName });

    await writeTokenFile(key);
    log('✅ Token created', {
        id: tokenId,
        name: tokenName,
    });

    // Deleted only after the new token is saved, so a failure leaves a working token.
    for (const { id, name } of oldTokens) {
        await callGrafana('DELETE', `/api/serviceaccounts/${serviceAccountId}/tokens/${id}`);
        log('🗑️ Old token deleted', {
            id,
            name,
        });
    }
}

// Only a 401 means that the token is gone. When Grafana is down or fails, the next check
// tries again, so a Grafana restart does not make new tokens.
async function isTokenRejected() {
    try {
        const token = (await readFile(TOKEN_FILE, 'utf8')).trim();
        const response = await fetch(`${GRAFANA_URL}/api/org`, { headers: { authorization: `Bearer ${token}` } });

        if (response.status === 401) {
            return true;
        }

        if (!response.ok) {
            log('⚠️ Token check failed', { status: response.status });
        }
    } catch (error) {
        log('⚠️ Token check failed', { error: error.message });
    }

    return false;
}

async function watchToken() {
    while (true) {
        await sleep(TOKEN_CHECK_INTERVAL_SECONDS * 1000);

        if (await isTokenRejected()) {
            log('🔁 Grafana rejected the token, creating a new one');
            await createToken();
        }
    }
}

await waitForGrafana();

if (TOKEN_CHECK_INTERVAL_SECONDS > 0) {
    await watchToken();
} else {
    await createToken();
}
