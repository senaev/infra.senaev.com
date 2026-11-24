import {
    constants, createPrivateKey, X509Certificate,
} from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SecureContextOptions } from 'node:tls';

/** Where the Helm templates mount the Certificate Secret of a service. */
const MTLS_DIRECTORY = '/etc/mtls';

/** The file names that cert-manager writes into a Certificate Secret. */
const TLS_KEY_FILE = 'tls.key';
const TLS_CERT_FILE = 'tls.crt';
const TLS_CA_FILE = 'ca.crt';

/** PEM text of the own key, the own certificate (first in the file) and the CA certificate. */
export type TlsFiles = {
    key: string;
    cert: string;
    ca: string;
};

export type TlsCredentials = TlsFiles & {
    /** Start of the validity of the own certificate. */
    validFrom: Date;
    /** End of the validity of the own certificate. */
    validTo: Date;
};

export function readTlsFiles(): Promise<TlsFiles> {
    return Promise.all([
        readFile(join(MTLS_DIRECTORY, TLS_KEY_FILE), 'utf8'),
        readFile(join(MTLS_DIRECTORY, TLS_CERT_FILE), 'utf8'),
        readFile(join(MTLS_DIRECTORY, TLS_CA_FILE), 'utf8'),
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
 * its last good credentials. The validity period is not checked here: see `isTlsCredentialsValidAt`.
 */
export function parseTlsCredentials(files: TlsFiles): TlsCredentials {
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
        validFrom: new Date(cert.validFrom),
        validTo: new Date(cert.validTo),
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

export function isTlsCredentialsValidAt(credentials: TlsCredentials, now: Date): boolean {
    const time = now.getTime();

    return credentials.validFrom.getTime() <= time && time < credentials.validTo.getTime();
}
