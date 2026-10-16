import {
    exportJWK, generateKeyPair, SignJWT,
} from 'jose';
import type { CustomFetch } from 'openid-client';

const GOOGLE_ISSUER = 'https://accounts.google.com';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
const KEY_ID = 'test-key';

export type FakeGoogle = Awaited<ReturnType<typeof createFakeGoogle>>;

/** Google's token endpoint and keys, served from memory to `customFetch`. */
export async function createFakeGoogle(clientId: string) {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const otherKey = await generateKeyPair('RS256');
    const jwk = {
        ...await exportJWK(publicKey),
        kid: KEY_ID,
        alg: 'RS256',
        use: 'sig',
    };

    let idTokenClaims: Record<string, unknown> = {};
    let signWithOtherKey = false;
    const tokenRequests: URLSearchParams[] = [];

    function signIdToken(): Promise<string> {
        return new SignJWT(idTokenClaims)
            .setProtectedHeader({
                alg: 'RS256',
                kid: KEY_ID,
            })
            .setIssuer(GOOGLE_ISSUER)
            .setAudience(clientId)
            .setSubject('google-subject')
            .setIssuedAt()
            .setExpirationTime('1h')
            .sign(signWithOtherKey ? otherKey.privateKey : privateKey);
    }

    const fetch: CustomFetch = async (url, options) => {
        if (url === GOOGLE_JWKS_URI) {
            return Response.json({ keys: [jwk] });
        }

        if (url === GOOGLE_TOKEN_ENDPOINT) {
            tokenRequests.push(new URLSearchParams(String(options.body)));

            return Response.json({
                access_token: 'google-access-token',
                token_type: 'Bearer',
                expires_in: 3600,
                id_token: await signIdToken(),
            });
        }

        return new Response('Not found', { status: 404 });
    };

    return {
        fetch,
        tokenRequests,
        /** The claims of the next ID token, in addition to iss, aud, sub, iat and exp. */
        setIdTokenClaims(claims: Record<string, unknown>) {
            idTokenClaims = claims;
        },
        signWithUnknownKey() {
            signWithOtherKey = true;
        },
    };
}
