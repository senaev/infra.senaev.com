/**
 * Which headers the proxy sets on requests to which host.
 *
 * MITM_RULES is a JSON object: host → { header name → value }. A value may name environment
 * variables of the proxy as ${NAME}. They are filled in at start, so a secret lives only in the
 * proxy's own environment:
 *
 *     {"api.github.com": {"authorization": "token ${GH_TOKEN}"}}
 *
 * Error messages name hosts, headers and variables, never values.
 */
export type HeaderRules = ReadonlyMap<string, Readonly<Record<string, string>>>;

const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const HEADER_NAME = /^[a-z0-9-]+$/;
const VARIABLE = /\$\{([A-Z0-9_]+)\}/g;

// Headers that describe the connection, not the request. A rule cannot set them.
export const HOP_BY_HOP_HEADERS: ReadonlySet<string> = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'proxy-connection',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
]);

export function parseRules(json: string, env: Readonly<Record<string, string | undefined>>): HeaderRules {
    const parsed: unknown = JSON.parse(json);

    if (!isObject(parsed) || Object.keys(parsed).length === 0) {
        throw new Error('MITM_RULES must be a JSON object with at least one host');
    }

    const rules = new Map<string, Record<string, string>>();

    for (const [
        host,
        headers,
    ] of Object.entries(parsed)) {
        if (!HOST.test(host)) {
            throw new Error(`MITM_RULES: "${host}" is not a lower-case host name`);
        }

        if (!isObject(headers) || Object.keys(headers).length === 0) {
            throw new Error(`MITM_RULES: ${host} must have an object with at least one header`);
        }

        const resolved: Record<string, string> = {};

        for (const [
            name,
            template,
        ] of Object.entries(headers)) {
            if (!HEADER_NAME.test(name) || name === 'host' || HOP_BY_HOP_HEADERS.has(name)) {
                throw new Error(`MITM_RULES: ${host} cannot set the header "${name}"`);
            }

            if (typeof template !== 'string') {
                throw new Error(`MITM_RULES: ${host} header ${name} must be a string`);
            }

            resolved[name] = template.replace(VARIABLE, (_match, variable: string) => {
                const value = env[variable];

                if (!value) {
                    throw new Error(`MITM_RULES: ${host} header ${name} needs the environment variable ${variable}`);
                }

                return value;
            });
        }

        rules.set(host, resolved);
    }

    return rules;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
