// Sends one QUIC v1 Initial (a TLS 1.3 ClientHello) and decrypts the server's Initial replies,
// so it shows whether the server answers with a ServerHello or a CONNECTION_CLOSE, or not at all.
// Initial keys come from the client's connection ID only (RFC 9001 5.2); later packets are not
// decrypted. No dependencies: node:crypto and node:dgram.
// Usage: node quic-initial-probe.mjs <host> [port=443] [sni=senaev.ru] [alpn=h3]
import crypto from 'node:crypto';
import dgram from 'node:dgram';

const [
    host,
    port = '443',
    sni = 'senaev.ru',
    alpn = 'h3',
] = process.argv.slice(2);
const INITIAL_SALT = Buffer.from('38762cf7f55934b34d179ae6a4c80cadccbb7f0a', 'hex');
const PN_LENGTH = 4;
const MIN_DATAGRAM = 1200;
const REPLY_LIMIT = 6;
const TIMEOUT_MS = 4000;

const print = (line) => process.stdout.write(`${line}\n`);
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const u16 = (n) => Buffer.from([
    n >> 8,
    n & 255,
]);

function expandLabel(secret, label, length) {
    const fullLabel = Buffer.from(`tls13 ${label}`);
    const info = Buffer.concat([
        u16(length),
        Buffer.from([fullLabel.length]),
        fullLabel,
        Buffer.from([0]),
    ]);
    let block = Buffer.alloc(0);
    let output = Buffer.alloc(0);

    for (let i = 1; output.length < length; i++) {
        block = hmac(secret, Buffer.concat([
            block,
            info,
            Buffer.from([i]),
        ]));
        output = Buffer.concat([
            output,
            block,
        ]);
    }

    return output.subarray(0, length);
}

function packetKeys(initialSecret, label) {
    const secret = expandLabel(initialSecret, label, 32);

    return {
        key: expandLabel(secret, 'quic key', 16),
        iv: expandLabel(secret, 'quic iv', 12),
        hp: expandLabel(secret, 'quic hp', 16),
    };
}

function varint(n) {
    if (n < 64) {
        return Buffer.from([n]);
    }

    if (n < 16384) {
        return Buffer.from([
            0x40 | (n >> 8),
            n & 255,
        ]);
    }

    const buffer = Buffer.alloc(4);

    buffer.writeUInt32BE(0x80000000 + n);

    return buffer;
}

function readVarint(buffer, offset) {
    const length = 1 << (buffer[offset] >> 6);
    let value = buffer[offset] & 0x3f;

    for (let i = 1; i < length; i++) {
        value = value * 256 + buffer[offset + i];
    }

    return [
        value,
        offset + length,
    ];
}

function headerMask(hpKey, sample) {
    const cipher = crypto.createCipheriv('aes-128-ecb', hpKey, null);

    cipher.setAutoPadding(false);

    return cipher.update(sample);
}

function nonce(iv, packetNumber) {
    const result = Buffer.from(iv);

    for (let i = 0; i < 8; i++) {
        result[11 - i] ^= Math.floor(packetNumber / 2 ** (8 * i)) & 255;
    }

    return result;
}

const extension = (type, data) => Buffer.concat([
    u16(type),
    u16(data.length),
    data,
]);

function transportParameter(id, value) {
    const encoded = varint(value);

    return Buffer.concat([
        varint(id),
        varint(encoded.length),
        encoded,
    ]);
}

function clientHello(sourceConnectionId) {
    const { publicKey } = crypto.generateKeyPairSync('x25519');
    const keyShare = publicKey.export({
        type: 'spki',
        format: 'der',
    }).subarray(-32);
    const sniBytes = Buffer.from(sni);
    const alpnBytes = Buffer.from(alpn);
    const transportParameters = Buffer.concat([
        Buffer.from([
            0x0f,
            sourceConnectionId.length,
        ]),
        sourceConnectionId,
        transportParameter(0x01, 30000),
        transportParameter(0x04, 1 << 20),
        transportParameter(0x05, 1 << 18),
        transportParameter(0x06, 1 << 18),
        transportParameter(0x07, 1 << 18),
        transportParameter(0x08, 16),
        transportParameter(0x09, 16),
    ]);
    const extensions = Buffer.concat([
        extension(0, Buffer.concat([
            u16(sniBytes.length + 3),
            Buffer.from([0]),
            u16(sniBytes.length),
            sniBytes,
        ])),
        extension(10, Buffer.from([
            0,
            2,
            0,
            0x1d,
        ])),
        extension(13, Buffer.from([
            0,
            6,
            4,
            3,
            8,
            4,
            4,
            1,
        ])),
        extension(16, Buffer.concat([
            u16(alpnBytes.length + 1),
            Buffer.from([alpnBytes.length]),
            alpnBytes,
        ])),
        extension(43, Buffer.from([
            2,
            3,
            4,
        ])),
        extension(45, Buffer.from([
            1,
            1,
        ])),
        extension(51, Buffer.concat([
            u16(36),
            u16(0x1d),
            u16(32),
            keyShare,
        ])),
        extension(0x39, transportParameters),
    ]);
    const body = Buffer.concat([
        Buffer.from([
            3,
            3,
        ]),
        crypto.randomBytes(32),
        Buffer.from([0]),
        u16(2),
        u16(0x1301),
        Buffer.from([
            1,
            0,
        ]),
        u16(extensions.length),
        extensions,
    ]);

    return Buffer.concat([
        Buffer.from([
            1,
            0,
            body.length >> 8,
            body.length & 255,
        ]),
        body,
    ]);
}

function initialPacket(clientKeys, destinationConnectionId, sourceConnectionId) {
    const hello = clientHello(sourceConnectionId);
    let payload = Buffer.concat([
        Buffer.from([
            6,
            0,
        ]),
        varint(hello.length),
        hello,
    ]);
    const headerStart = Buffer.concat([
        Buffer.from([
            0xc0 | (PN_LENGTH - 1),
            0,
            0,
            0,
            1,
            destinationConnectionId.length,
        ]),
        destinationConnectionId,
        Buffer.from([sourceConnectionId.length]),
        sourceConnectionId,
        Buffer.from([0]),
    ]);
    const payloadLength = MIN_DATAGRAM - headerStart.length - 2 - PN_LENGTH - 16;

    if (payload.length < payloadLength) {
        payload = Buffer.concat([
            payload,
            Buffer.alloc(payloadLength - payload.length),
        ]);
    }

    const length = varint(PN_LENGTH + payload.length + 16);
    const header = Buffer.concat([
        headerStart,
        length.length === 2
            ? length
            : Buffer.concat([
                Buffer.from([0x40]),
                length,
            ]),
        Buffer.alloc(PN_LENGTH),
    ]);
    const cipher = crypto.createCipheriv('aes-128-gcm', clientKeys.key, nonce(clientKeys.iv, 0));

    cipher.setAAD(header);
    const packet = Buffer.concat([
        header,
        cipher.update(payload),
        cipher.final(),
        cipher.getAuthTag(),
    ]);
    const pnOffset = header.length - PN_LENGTH;
    const mask = headerMask(clientKeys.hp, packet.subarray(pnOffset + 4, pnOffset + 20));

    packet[0] ^= mask[0] & 0x0f;
    for (let i = 0; i < PN_LENGTH; i++) {
        packet[pnOffset + i] ^= mask[1 + i];
    }

    return packet;
}

function skipVarints(buffer, offset, count) {
    let position = offset;

    for (let i = 0; i < count; i++) {
        [
            , position,
        ] = readVarint(buffer, position);
    }

    return position;
}

function describeAck(payload, offset) {
    const type = payload[offset];
    const [
        largest,
        afterLargest,
    ] = readVarint(payload, offset + 1);
    const afterDelay = skipVarints(payload, afterLargest, 1);
    const [
        rangeCount,
        afterCount,
    ] = readVarint(payload, afterDelay);
    let position = skipVarints(payload, afterCount, 1 + 2 * rangeCount);

    if (type === 3) {
        position = skipVarints(payload, position, 3);
    }

    return [
        `ACK(largest=${largest})`,
        position,
    ];
}

function describeCrypto(payload, offset) {
    const [
        cryptoOffset,
        afterOffset,
    ] = readVarint(payload, offset + 1);
    const [
        length,
        afterLength,
    ] = readVarint(payload, afterOffset);
    const firstType = cryptoOffset === 0 ? payload[afterLength] : '?';
    const name = firstType === 2 ? ' = ServerHello' : '';

    return [
        `CRYPTO(off=${cryptoOffset}, len=${length}, first handshake message type=${firstType}${name})`,
        afterLength + length,
    ];
}

function describeClose(payload, offset) {
    const type = payload[offset];
    let [
        code,
        position,
    ] = readVarint(payload, offset + 1);
    let frameType = 0;

    if (type === 0x1c) {
        [
            frameType,
            position,
        ] = readVarint(payload, position);
    }

    const [
        reasonLength,
        afterReason,
    ] = readVarint(payload, position);
    const tlsAlert = code >= 0x100 && code < 0x200 ? ` (TLS alert ${code - 0x100})` : '';
    const reason = payload.subarray(afterReason, afterReason + reasonLength).toString();

    return [
        `CONNECTION_CLOSE(code=0x${code.toString(16)}${tlsAlert}, frame=${frameType}, reason="${reason}")`,
        afterReason + reasonLength,
    ];
}

function describeFrames(payload) {
    const frames = [];
    let offset = 0;

    while (offset < payload.length) {
        const type = payload[offset];

        if (type === 0) {
            offset++;
        } else if (type === 1) {
            frames.push('PING');
            offset++;
        } else if (type === 2 || type === 3) {
            const [
                text,
                next,
            ] = describeAck(payload, offset);

            frames.push(text);
            offset = next;
        } else if (type === 6) {
            const [
                text,
                next,
            ] = describeCrypto(payload, offset);

            frames.push(text);
            offset = next;
        } else if (type === 0x1c || type === 0x1d) {
            const [
                text,
                next,
            ] = describeClose(payload, offset);

            frames.push(text);
            offset = next;
        } else {
            frames.push(`frame 0x${type.toString(16)} (not parsed further)`);
            break;
        }
    }

    return frames;
}

function decryptInitial(serverKeys, datagram, {
    start, pnOffset, end,
}) {
    const packet = Buffer.from(datagram.subarray(start, end));
    const offset = pnOffset - start;
    const mask = headerMask(serverKeys.hp, packet.subarray(offset + 4, offset + 20));

    packet[0] ^= mask[0] & 0x0f;
    const pnLength = (packet[0] & 3) + 1;
    let packetNumber = 0;

    for (let i = 0; i < pnLength; i++) {
        packet[offset + i] ^= mask[1 + i];
        packetNumber = packetNumber * 256 + packet[offset + i];
    }

    const decipher = crypto.createDecipheriv('aes-128-gcm', serverKeys.key, nonce(serverKeys.iv, packetNumber));

    decipher.setAAD(packet.subarray(0, offset + pnLength));
    decipher.setAuthTag(packet.subarray(packet.length - 16));
    const payload = Buffer.concat([
        decipher.update(packet.subarray(offset + pnLength, packet.length - 16)),
        decipher.final(),
    ]);

    return `Initial pn=${packetNumber} ${end - start} B: ${describeFrames(payload).join(', ')}`;
}

function describeDatagram(serverKeys, datagram) {
    const lines = [];
    let start = 0;

    while (start < datagram.length) {
        if (!(datagram[start] & 0x80)) {
            lines.push(`short-header packet ${datagram.length - start} B`);
            break;
        }

        if (datagram.readUInt32BE(start + 1) === 0) {
            lines.push('VERSION NEGOTIATION');
            break;
        }

        const type = [
            'Initial',
            '0-RTT',
            'Handshake',
            'Retry',
        ][(datagram[start] >> 4) & 3];

        if (type === 'Retry') {
            lines.push(`Retry packet ${datagram.length - start} B`);
            break;
        }

        let position = start + 5;

        position += 1 + datagram[position];
        position += 1 + datagram[position];
        if (type === 'Initial') {
            const [
                tokenLength,
                afterToken,
            ] = readVarint(datagram, position);

            position = afterToken + tokenLength;
        }

        const [
            length,
            pnOffset,
        ] = readVarint(datagram, position);
        const end = pnOffset + length;

        if (type === 'Initial') {
            try {
                lines.push(decryptInitial(serverKeys, datagram, {
                    start,
                    pnOffset,
                    end,
                }));
            } catch (error) {
                lines.push(`Initial ${end - start} B: decryption failed (${error.message})`);
            }
        } else {
            lines.push(`${type} packet ${end - start} B (encrypted, not decrypted)`);
        }

        start = end;
    }

    return lines;
}

const destinationConnectionId = crypto.randomBytes(8);
const sourceConnectionId = crypto.randomBytes(8);
const initialSecret = hmac(INITIAL_SALT, destinationConnectionId);
const clientKeys = packetKeys(initialSecret, 'client in');
const serverKeys = packetKeys(initialSecret, 'server in');
const packet = initialPacket(clientKeys, destinationConnectionId, sourceConnectionId);

const socket = dgram.createSocket('udp4');
let replies = 0;

socket.on('message', (message, remote) => {
    print(`<- ${message.length} B from ${remote.address}:${remote.port}`);
    for (const line of describeDatagram(serverKeys, message)) {
        print(`   ${line}`);
    }

    replies++;
    if (replies >= REPLY_LIMIT) {
        process.exit(0);
    }
});
socket.send(packet, Number(port), host, (error) => {
    if (error) {
        throw error;
    }

    print(`-> Initial ${packet.length} B to ${host}:${port} sni=${sni} alpn=${alpn}`);
});
setTimeout(() => {
    print(replies ? 'done' : `no reply in ${TIMEOUT_MS / 1000} s`);
    process.exit(0);
}, TIMEOUT_MS);
