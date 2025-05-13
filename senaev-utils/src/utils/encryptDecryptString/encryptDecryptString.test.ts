import {
    describe, expect, it,
} from 'vitest';

import { decryptString, encryptString } from './encryptDecryptString';

describe('encryptDecryptString', () => {
    const secret = '111some111local111random111secret1123456789';
    const testString = 'Hello, World!';

    it('should encrypt and decrypt string successfully', async () => {
        const encrypted = await encryptString({
            string: testString,
            secret,
        });

        expect(encrypted).toBeDefined();
        expect(typeof encrypted).toBe('string');
        expect(encrypted).not.toBe(testString);
        expect(encrypted).not.toContain('Hello');

        const decrypted = await decryptString({
            string: encrypted,
            secret,
        });

        expect(decrypted).toBe(testString);
    });

    it('should handle empty string', async () => {
        const encrypted = await encryptString({
            string: '',
            secret,
        });

        const decrypted = await decryptString({
            string: encrypted,
            secret,
        });

        expect(decrypted).toBe('');
    });

    it('should handle special characters', async () => {
        const specialString = '!@#$%^&*()_+{}|:"<>?~`-=[]\\;\',./';

        const encrypted = await encryptString({
            string: specialString,
            secret,
        });

        const decrypted = await decryptString({
            string: encrypted,
            secret,
        });

        expect(decrypted).toBe(specialString);
    });

    it('should throw error when decrypting with wrong secret', async () => {
        const encrypted = await encryptString({
            string: testString,
            secret,
        });

        const wrongSecret = 'wrong-secret-key-32-chars-long!!';

        await expect(decryptString({
            string: encrypted,
            secret: wrongSecret,
        })).rejects.toThrow();
    });

    it('should throw error when decrypting invalid string', async () => {
        await expect(decryptString({
            string: 'invalid-encrypted-string',
            secret,
        })).rejects.toThrow();
    });
});
