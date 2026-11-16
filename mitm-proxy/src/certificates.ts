import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export type Certificates = {
    /** Public. Clients trust it to accept the proxy as the hosts. */
    caCertificate: string;
    /** The proxy presents this for every intercepted host. */
    serverCertificate: string;
    serverKey: string;
};

/**
 * Makes a new certificate authority and one server certificate for the hosts, with openssl.
 *
 * The authority exists only for this run of the proxy, and it is limited twice:
 * - name constraints: clients accept it only for these hosts, whatever it signs;
 * - its key is deleted right after it signs the server certificate, so it never signs anything else.
 */
export function createCertificates(hosts: readonly string[]): Certificates {
    const folder = mkdtempSync(path.join(tmpdir(), 'mitm-proxy-'));
    const file = (name: string) => path.join(folder, name);
    const dnsNames = hosts.map((host) => `DNS:${host}`);
    const permitted = dnsNames.map((name) => `permitted;${name}`).join(',');

    try {
        // The certificate authority.
        openssl(`req -x509 -nodes -days 3650 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1
            -subj /CN=mitm-proxy-ca
            -addext basicConstraints=critical,CA:TRUE,pathlen:0
            -addext keyUsage=critical,keyCertSign
            -addext nameConstraints=critical,${permitted}
            -keyout ${file('ca.key')} -out ${file('ca.crt')}`);

        // The server key and its signing request.
        openssl(`req -new -nodes -newkey ec -pkeyopt ec_paramgen_curve:prime256v1
            -subj /CN=mitm-proxy
            -keyout ${file('server.key')} -out ${file('server.csr')}`);

        // The server certificate, signed by the authority, for all the hosts.
        writeFileSync(file('server.ext'), [
            `subjectAltName=${dnsNames.join(',')}`,
            'basicConstraints=critical,CA:FALSE',
            'keyUsage=critical,digitalSignature',
            'extendedKeyUsage=serverAuth',
        ].join('\n'));
        openssl(`x509 -req -days 3650 -set_serial 0x${randomBytes(16).toString('hex')}
            -CA ${file('ca.crt')} -CAkey ${file('ca.key')}
            -in ${file('server.csr')} -extfile ${file('server.ext')} -out ${file('server.crt')}`);

        return {
            caCertificate: readFileSync(file('ca.crt'), 'utf8'),
            serverCertificate: readFileSync(file('server.crt'), 'utf8'),
            serverKey: readFileSync(file('server.key'), 'utf8'),
        };
    } finally {
        // The CA key goes here, with everything else.
        rmSync(folder, {
            recursive: true,
            force: true,
        });
    }
}

/** Runs openssl with the words of the command as arguments. No argument has a space in it. */
function openssl(command: string): void {
    execFileSync('openssl', command.trim().split(/\s+/), {
        stdio: [
            'ignore',
            'ignore',
            'pipe',
        ],
    });
}
