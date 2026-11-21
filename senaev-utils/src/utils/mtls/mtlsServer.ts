import type { Socket } from 'node:net';
import { TLSSocket } from 'node:tls';

import { createSecureContextOptions, type TlsCredentials } from './tlsCredentials';

/** Options for `https.createServer` / Fastify `https`: the client must present a certificate of our CA. */
export function createMtlsServerOptions(credentials: TlsCredentials) {
    return {
        ...createSecureContextOptions(credentials),
        requestCert: true,
        rejectUnauthorized: true,
    };
}

export type MtlsCaller = {
    /** True when the client certificate carries exactly this DNS name. */
    hasDnsName: (name: string) => boolean;
};

export type MtlsCallerAuthentication = { ok: true; caller: MtlsCaller } | { ok: false; reason: string };

const EXACT_NAME_MATCH = {
    subject: 'never',
    wildcards: false,
    partialWildcards: false,
    multiLabelWildcards: false,
} as const;

/**
 * Identifies the caller of a request on a connection that the TLS server already verified
 * against the CA. It checks again on every request, because a connection can outlive the
 * certificate: the certificate must not be expired. It does not decide who may do what: the
 * service asks the caller for the names it allows, and Node does the matching. The names are plain
 * labels that cert-manager puts in the certificate.
 */
export function authenticateMtlsCaller(socket: Socket, now: Date): MtlsCallerAuthentication {
    if (!(socket instanceof TLSSocket) || !socket.authorized) {
        return {
            ok: false,
            reason: 'No verified client certificate',
        };
    }

    const certificate = socket.getPeerX509Certificate();

    if (certificate === undefined) {
        return {
            ok: false,
            reason: 'No client certificate',
        };
    }

    if (now.getTime() >= new Date(certificate.validTo).getTime()) {
        return {
            ok: false,
            reason: 'The client certificate is expired',
        };
    }

    return {
        ok: true,
        caller: { hasDnsName: (name) => certificate.checkHost(name, EXACT_NAME_MATCH) !== undefined },
    };
}
