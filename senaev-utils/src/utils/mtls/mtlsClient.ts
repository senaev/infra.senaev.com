import {
    Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit,
} from 'undici';

import { createSecureContextOptions, type TlsCredentials } from './tlsCredentials';

export type MtlsFetch = (url: string | URL, init?: RequestInit) => Promise<Response>;

export type MtlsClient = {
    fetch: MtlsFetch;
    /** Uses new credentials for new connections; the old connections finish their requests first. */
    updateCredentials: (credentials: TlsCredentials) => void;
    close: () => Promise<void>;
};

function createAgent(credentials: TlsCredentials): Agent {
    return new Agent({ connect: createSecureContextOptions(credentials) });
}

/**
 * A fetch that talks to one origin with a client certificate. The server certificate is checked
 * the standard way: against our CA, and against the host name of the URL. The credentials
 * are never sent anywhere else: another origin and every redirect are refused.
 *
 * `origin` must be a normal origin, like `https://host:8443`, with no path and no trailing
 * slash. Any other form matches no URL, so every request is refused.
 *
 * It uses undici's own `fetch` with its own `Agent`: the built-in `fetch` cannot take TLS
 * options, and a global dispatcher would change every other request of the process.
 */
export function createMtlsClient({ origin, credentials }: { origin: string; credentials: TlsCredentials }): MtlsClient {
    let agent = createAgent(credentials);

    return {
        fetch: (url, init) => {
            const target = new URL(url);

            if (target.origin !== origin) {
                return Promise.reject(new Error(`Refusing to send the client certificate to ${target.origin}`));
            }

            // The two Response and RequestInit types describe the same object. Only their declarations differ.
            return undiciFetch(target, {
                ...init as UndiciRequestInit,
                dispatcher: agent,
                redirect: 'error',
            }) as unknown as Promise<Response>;
        },
        updateCredentials: (next) => {
            const previous = agent;

            agent = createAgent(next);
            void previous.close().catch(() => undefined);
        },
        close: () => agent.close(),
    };
}
