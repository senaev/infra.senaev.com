import 'reflect-metadata';

import * as x509 from '@peculiar/x509';

import type { TlsFiles } from './tlsMaterial';

/** Test-only: builds a throwaway CA and leaf certificates like the ones cert-manager issues. */

const ALGORITHM = {
    name: 'ECDSA',
    namedCurve: 'P-256',
    hash: 'SHA-256',
} as const;

const HOUR_MS = 3_600_000;

export type TestCa = {
    certificatePem: string;
    keys: CryptoKeyPair;
    name: string;
};

type Validity = {
    validFrom?: Date;
    validTo?: Date;
};

async function exportPrivateKeyPem(key: CryptoKey): Promise<string> {
    const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', key)).toString('base64');

    return `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/gu)?.join('\n') ?? ''}\n-----END PRIVATE KEY-----\n`;
}

async function createCaCertificate(name: string, keys: CryptoKeyPair, validity: Validity, serialNumber: string): Promise<TestCa> {
    const now = Date.now();
    const certificate = await x509.X509CertificateGenerator.createSelfSigned({
        serialNumber,
        name: `CN=${name}`,
        notBefore: validity.validFrom ?? new Date(now - HOUR_MS),
        notAfter: validity.validTo ?? new Date(now + 24 * HOUR_MS),
        signingAlgorithm: ALGORITHM,
        keys,
        extensions: [
            new x509.BasicConstraintsExtension(true, undefined, true),
            new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
        ],
    });

    return {
        certificatePem: certificate.toString('pem'),
        keys,
        name,
    };
}

export async function createTestCa(name = 'test-ca', validity: Validity = {}): Promise<TestCa> {
    const keys = await crypto.subtle.generateKey(ALGORITHM, true, [
        'sign',
        'verify',
    ]);

    return createCaCertificate(name, keys, validity, '01');
}

/** What cert-manager does to a CA with `rotationPolicy: Never`: a new certificate, the same key. */
export function renewTestCa(ca: TestCa, validity: Validity = {}): Promise<TestCa> {
    return createCaCertificate(ca.name, ca.keys, validity, '03');
}

/** A leaf certificate with exactly one DNS name, usable only as a server or only as a client. */
export async function issueTestCertificate({
    ca,
    dnsName,
    usage,
    serialNumber = '02',
    ...validity
}: Validity & { ca: TestCa; dnsName: string; usage: 'server' | 'client'; serialNumber?: string }): Promise<TlsFiles> {
    const keys = await crypto.subtle.generateKey(ALGORITHM, true, [
        'sign',
        'verify',
    ]);
    const now = Date.now();
    const certificate = await x509.X509CertificateGenerator.create({
        serialNumber,
        subject: `CN=${dnsName}`,
        issuer: `CN=${ca.name}`,
        notBefore: validity.validFrom ?? new Date(now - HOUR_MS),
        notAfter: validity.validTo ?? new Date(now + 24 * HOUR_MS),
        signingAlgorithm: ALGORITHM,
        publicKey: keys.publicKey,
        signingKey: ca.keys.privateKey,
        extensions: [
            new x509.BasicConstraintsExtension(false, undefined, true),
            new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
            new x509.ExtendedKeyUsageExtension([usage === 'server' ? x509.ExtendedKeyUsage.serverAuth : x509.ExtendedKeyUsage.clientAuth]),
            new x509.SubjectAlternativeNameExtension([
                {
                    type: 'dns',
                    value: dnsName,
                },
            ]),
        ],
    });

    return {
        key: await exportPrivateKeyPem(keys.privateKey),
        cert: certificate.toString('pem'),
        ca: ca.certificatePem,
    };
}
