import {
    base64url,
    EncryptJWT,
    jwtDecrypt,
} from 'jose';

export function encryptString({
    string,
    secret,
}: {
    string: string;
    secret: string;
}): Promise<string> {
    return new EncryptJWT({
        string,
    })
        .setProtectedHeader({
            alg: 'dir',
            enc: 'A128CBC-HS256',
        })
        .encrypt(base64url.decode(secret));
}

export async function decryptString({
    string,
    secret,
}: {
    string: string;
    secret: string;
}): Promise<string> {
    const { payload } = await jwtDecrypt(string, base64url.decode(secret));

    return payload.string as string;
}
