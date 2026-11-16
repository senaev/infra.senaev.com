import {
    constants, createPrivateKey, X509Certificate,
} from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SecureContextOptions } from 'node:tls';

/** The file names that cert-manager writes into a Certificate Secret. */
export const TLS_KEY_FILE = 'tls.key';
export const TLS_CERT_FILE = 'tls.crt';
export const TLS_CA_FILE = 'ca.crt';

/** PEM text of the own key, the own certificate (first in the file) and the CA certificate. */
export type TlsFiles = {
    key: string;
    cert: string;
    ca: string;
};

export type TlsMaterial = TlsFiles & {
    /** End of the validity of the own certificate. */
    notAfter: Date;
};

export function readTlsFiles(directory: string): Promise<TlsFiles> {
    return Promise.all([
        readFile(join(directory, TLS_KEY_FILE), 'utf8'),
        readFile(join(directory, TLS_CERT_FILE), 'utf8'),
        readFile(join(directory, TLS_CA_FILE), 'utf8'),
    ]).then(([
        key,
        cert,
        ca,
    ]) => {
        return {
            key,
            cert,
            ca,
        };
    });
}

export function isSameTlsFiles(a: TlsFiles, b: TlsFiles): boolean {
    return a.key === b.key && a.cert === b.cert && a.ca === b.ca;
}

/**
 * Checks that the files fit together: the key belongs to the certificate, and the CA
 * certificate signed it. A half-written or mixed-up snapshot fails here, so the caller keeps
 * its last good material. Expiry is not checked here: see `isTlsMaterialValidAt`.
 */
export function parseTlsMaterial(files: TlsFiles): TlsMaterial {
    const cert = new X509Certificate(files.cert);
    const ca = new X509Certificate(files.ca);

    if (!cert.checkPrivateKey(createPrivateKey(files.key))) {
        throw new Error('The TLS private key does not belong to the TLS certificate');
    }

    if (!cert.checkIssued(ca) || !cert.verify(ca.publicKey)) {
        throw new Error('The TLS certificate was not signed by the CA certificate');
    }

    return {
        ...files,
        notAfter: new Date(cert.validTo),
    };
}

/**
 * TLS 1.3 only, without session tickets: every connection does a full handshake, so a renewed
 * or replaced credential is never bypassed by a resumed session. Connections inside the cluster
 * are cheap to set up.
 */
export function createSecureContextOptions({
    key, cert, ca,
}: TlsFiles): SecureContextOptions {
    return {
        key,
        cert,
        ca,
        minVersion: 'TLSv1.3',
        secureOptions: constants.SSL_OP_NO_TICKET,
    };
}

export function isTlsMaterialValidAt(material: TlsMaterial, now: Date): boolean {
    return now.getTime() < material.notAfter.getTime();
}
