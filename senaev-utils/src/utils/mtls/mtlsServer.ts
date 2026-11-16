import type { Socket } from 'node:net';
import { TLSSocket } from 'node:tls';

import { createSecureContextOptions, type TlsMaterial } from './tlsMaterial';

/** Options for `https.createServer` / Fastify `https`: the client must present a certificate of our CA. */
export function createMtlsServerOptions(material: TlsMaterial) {
    return {
        ...createSecureContextOptions(material),
        requestCert: true,
        rejectUnauthorized: true,
    };
}

export type MtlsPeerCheck = { ok: true } | { ok: false; reason: string };

const EXACT_NAME_MATCH = {
    subject: 'never',
    wildcards: false,
    partialWildcards: false,
    multiLabelWildcards: false,
} as const;

/**
 * Authorizes the caller of a request on a connection that the TLS server already verified
 * against the CA. It still checks the caller on every request, because a connection can outlive
 * the certificate: the certificate must not be expired, and it must carry exactly the DNS name
 * that this service allows. The names are plain labels that cert-manager puts in the
 * certificate, and Node does the matching.
 */
export function checkMtlsPeer(socket: Socket, allowedName: string, now: Date): MtlsPeerCheck {
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

    if (certificate.checkHost(allowedName, EXACT_NAME_MATCH) === undefined) {
        return {
            ok: false,
            reason: 'The client certificate is not for an allowed service',
        };
    }

    return { ok: true };
}
