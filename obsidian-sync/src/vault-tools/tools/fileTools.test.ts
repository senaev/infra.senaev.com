import {
    readFile, readdir, symlink, truncate, writeFile,
} from 'node:fs/promises';

import {
    afterEach, describe, expect, it, vi,
} from 'vitest';
import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';

import { createTestVault, type TestVault } from '../createTestVault';
import { hashBytes, MAX_FILE_BYTES } from '../access/vaultFiles';

import { uploadTool, validateDownloadUrl } from './uploadTool';
import { deleteTool } from './deleteTool';
import { readTool } from './readTool';
import { listTool } from './listTool';
import { patchTool } from './patchTool';
import { moveTool } from './moveTool';

let vault: TestVault;
const file = {
    download_url: 'https://files.oaiusercontent.com/test?secret=hidden',
    file_id: 'file_test',
};

afterEach(async () => {
    vi.unstubAllGlobals();
    await vault?.remove();
});

describe('file upload', () => {
    it('streams original binary bytes to nested folders and refuses overwrite', async () => {
        vault = await createTestVault({});
        const bytes = Buffer.from([
            0,
            255,
            1,
            128,
        ]);
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(bytes)));

        vi.stubGlobal('fetch', fetchMock);
        const result = await uploadTool(vault.config, {
            path: 'finances/payslips/a.pdf',
            file,
        });

        expect(result).toEqual({
            path: 'finances/payslips/a.pdf',
            size: 4,
            hash: hashBytes(bytes),
        });
        expect(await readFile(vault.path(result.path))).toEqual(bytes);
        await expect(uploadTool(vault.config, {
            path: result.path,
            file,
        })).rejects.toMatchObject({ code: 'already_exists' });
        expect(await readdir(vault.path('finances/payslips'))).toEqual(['a.pdf']);
    });

    it.each([
        'http://files.oaiusercontent.com/a',
        'https://files.oaiusercontent.com.evil.test/a',
        'https://sdmntpr-attacker.s3.amazonaws.com/a',
        'https://oaisdmntprattacker.blob.core.windows.net/a',
        'https://oaisdsorprattacker.blob.core.windows.net/a',
        'https://sdmntpr-attacker.s3.us-east-1.amazonaws.com/a',
        'https://localhost/a',
        'https://127.0.0.1/a',
        'https://files.oaiusercontent.com:444/a',
        'https://user:password@files.oaiusercontent.com/a',
    ])('rejects untrusted URL %s', (url) => {
        expect(() => validateDownloadUrl(url)).toThrow();
    });

    it('rejects forbidden paths before fetching', async () => {
        vault = await createTestVault({});
        const fetchMock = vi.fn();

        vi.stubGlobal('fetch', fetchMock);
        for (const path of [
            '../escape.pdf',
            '.obsidian/a.pdf',
            'plugins/a.csv',
        ]) {
            await expect(uploadTool(vault.config, {
                path,
                file,
            })).rejects.toMatchObject({ code: 'forbidden_path' });
        }

        await symlink(vault.config.root, vault.path('alias'));
        await expect(uploadTool(vault.config, {
            path: 'alias/a.csv',
            file,
        })).rejects.toMatchObject({ code: 'forbidden_path' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        'http://localhost/admin',
        'https://sdmntpr-attacker.s3.amazonaws.com/a',
        'https://oaisdmntprattacker.blob.core.windows.net/a',
    ])('rejects redirect to %s and removes temporary files', async (location) => {
        vault = await createTestVault({});
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
            status: 302,
            headers: { location },
        }));

        vi.stubGlobal('fetch', fetchMock);
        await expect(uploadTool(vault.config, {
            path: 'a.pdf',
            file,
        })).rejects.toThrow();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(await readdir(vault.config.root)).toEqual([]);
    });

    it('rejects excessive lengths, including streams without Content-Length', async () => {
        vault = await createTestVault({});
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { headers: { 'content-length': String(MAX_FILE_BYTES + 1) } })));
        await expect(uploadTool(vault.config, {
            path: 'a.pdf',
            file,
        })).rejects.toMatchObject({ code: 'file_too_large' });
        const chunk = new Uint8Array(1024 * 1024);

        vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(new ReadableStream({
            start(controller) {
                for (let i = 0; i < 26; i += 1) {
                    controller.enqueue(chunk);
                }

                controller.close();
            },
        })))));
        await expect(uploadTool(vault.config, {
            path: 'a.pdf',
            file,
        })).rejects.toMatchObject({ code: 'file_too_large' });
        expect(await readdir(vault.config.root)).toEqual([]);
    });

    it('sanitizes failed/expired download URLs and removes incomplete data', async () => {
        vault = await createTestVault({});
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(file.download_url)));
        await expect(uploadTool(vault.config, {
            path: 'a.pdf',
            file,
        })).rejects.toMatchObject({
            code: 'download_failed',
            message: expect.not.stringContaining('secret='),
        });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('expired', { status: 403 })));
        await expect(uploadTool(vault.config, {
            path: 'a.pdf',
            file,
        })).rejects.toMatchObject({ code: 'download_failed' });
        expect(await readdir(vault.config.root)).toEqual([]);
    });

    it('cancels a download without publishing a partial file', async () => {
        vault = await createTestVault({});
        const abort = new AbortController();

        vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
            abort.abort();

            return Promise.resolve(new Response('partial'));
        }));
        await expect(uploadTool(vault.config, {
            path: 'a.pdf',
            file,
        }, createCommandExecution({ signal: abort.signal }))).rejects.toThrow();
        expect(await readdir(vault.config.root)).toEqual([]);
    });
});

describe('file lifecycle', () => {
    it('classifies text by case-insensitive extension and preserves control characters', async () => {
        const text = '\u001b[31mred\u001b[0m\u0000';

        vault = await createTestVault({
            'a.TXT': text,
            'a.MD': text,
            'a.CSV': text,
            'a.unknown': 'plain ASCII text',
            'no-extension': 'plain ASCII text',
        });
        for (const path of [
            'a.TXT',
            'a.MD',
            'a.CSV',
        ]) {
            const result = await readTool(vault.config, { paths: [path] });

            expect(result.notes[0]).toMatchObject({
                binary: false,
                content: text,
            });
        }

        for (const path of [
            'a.unknown',
            'no-extension',
        ]) {
            const result = await readTool(vault.config, { paths: [path] });

            expect(result.notes[0]).toMatchObject({
                binary: true,
                content: '',
            });
        }

        const before = (await readTool(vault.config, { paths: ['a.CSV'] })).notes[0];

        await patchTool(vault.config, {
            path: 'a.CSV',
            expectedHash: before?.hash,
            operations: [
                {
                    type: 'append',
                    text: '\u001b[0m',
                },
            ],
        });
        expect(await readFile(vault.path('a.CSV'), 'utf8')).toBe(`${text}\u001b[0m`);
    });

    it('reports invalid UTF-8 in an allowlisted file as an encoding error', async () => {
        vault = await createTestVault({ 'bad.txt': '' });
        await writeFile(vault.path('bad.txt'), Buffer.from([255]));
        await expect(readTool(vault.config, { paths: ['bad.txt'] }))
            .rejects.toMatchObject({ code: 'invalid_text_encoding' });
    });

    it('reads and edits CSV preserving BOM, CRLF and exact append semantics', async () => {
        const text = '\uFEFFname,value\r\n"one,two",1\r\n';

        vault = await createTestVault({ 'a.csv': text });
        const before = await readTool(vault.config, { paths: ['a.csv'] });

        expect(before.notes[0]).toMatchObject({
            content: text,
            hash: hashBytes(Buffer.from(text)),
            frontmatter: null,
        });
        await patchTool(vault.config, {
            path: 'a.csv',
            expectedHash: before.notes[0]?.hash,
            operations: [
                {
                    type: 'replace',
                    find: '"one,two",1',
                    replace: '"one,two",2',
                },
                {
                    type: 'append',
                    text: 'three,3',
                },
            ],
        });
        expect(await readFile(vault.path('a.csv'), 'utf8')).toBe('\uFEFFname,value\r\n"one,two",2\r\nthree,3');
        await expect(patchTool(vault.config, {
            path: 'a.csv',
            expectedHash: before.notes[0]?.hash,
            operations: [
                {
                    type: 'append',
                    text: 'stale',
                },
            ],
        })).rejects.toMatchObject({ code: 'conflict' });
    });

    it('lists attachments with hashes, returns binary metadata and rejects binary/Markdown-specific edits', async () => {
        vault = await createTestVault({
            'a.pdf': '%PDF ascii binary',
            'a.csv': 'a,b',
        });
        const entries = await listTool(vault.config, { includeAttachments: true });

        expect(entries.entries).toEqual(expect.arrayContaining([
            expect.objectContaining({
                path: 'a.pdf',
                hash: hashBytes(Buffer.from('%PDF ascii binary')),
            }),
        ]));
        expect((await listTool(vault.config, {})).entries).toEqual([]);
        const result = await readTool(vault.config, { paths: ['a.pdf'] });

        expect(result.notes[0]).toMatchObject({
            binary: true,
            content: '',
            size: 17,
        });
        await expect(patchTool(vault.config, {
            path: 'a.pdf',
            expectedHash: result.notes[0]?.hash,
            operations: [
                {
                    type: 'append',
                    text: 'x',
                },
            ],
        })).rejects.toMatchObject({ code: 'binary_file' });
        const csv = (await readTool(vault.config, { paths: ['a.csv'] })).notes[0];

        await expect(patchTool(vault.config, {
            path: 'a.csv',
            expectedHash: csv?.hash,
            operations: [
                {
                    type: 'setFrontmatter',
                    properties: { x: 1 },
                },
            ],
        })).rejects.toMatchObject({ code: 'invalid_arguments' });
        await writeFile(vault.path('a.csv'), Buffer.from([
            255,
            0,
        ]));
        await expect(patchTool(vault.config, {
            path: 'a.csv',
            expectedHash: csv?.hash,
            operations: [
                {
                    type: 'append',
                    text: 'x',
                },
            ],
        })).rejects.toMatchObject({ code: 'invalid_text_encoding' });
    });

    it('moves a binary attachment byte-for-byte and rewrites embeds and Markdown links', async () => {
        vault = await createTestVault({
            'a.pdf': '',
            'Note.md': '![[a.pdf]]\n[receipt](a.pdf)\n',
        });
        const data = Buffer.from([
            0,
            255,
            128,
        ]);

        await writeFile(vault.path('a.pdf'), data);
        const result = await moveTool(vault.config, {
            path: 'a.pdf',
            newPath: 'files/b.pdf',
        });

        expect(result.newPath).toBe('files/b.pdf');
        expect(result.rewrittenLinks).toBe(2);
        expect(await readFile(vault.path('files/b.pdf'))).toEqual(data);
        expect(await readFile(vault.path('Note.md'), 'utf8')).toContain('files/b.pdf');
        await expect(readFile(vault.path('a.pdf'))).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('trashes notes and attachments with hash protection and reports backlinks', async () => {
        vault = await createTestVault({
            'a.csv': 'x,y',
            'Note.md': '[[a.csv]]',
        });
        await expect(deleteTool(vault.config, {
            path: 'a.csv',
            expectedHash: '0'.repeat(64),
        })).rejects.toMatchObject({ code: 'conflict' });
        const result = await deleteTool(vault.config, {
            path: 'a.csv',
            expectedHash: hashBytes(Buffer.from('x,y')),
        });

        expect(result.backlinkCount).toBe(1);
        expect(await readFile(vault.path(result.trashPath), 'utf8')).toBe('x,y');
        expect(await readFile(vault.path('Note.md'), 'utf8')).toBe('[[a.csv]]');
        await expect(readFile(vault.path('a.csv'))).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(deleteTool(vault.config, {
            path: result.trashPath,
            expectedHash: result.hash,
        })).rejects.toMatchObject({ code: 'forbidden_path' });
        const note = await deleteTool(vault.config, {
            path: 'Note.md',
            expectedHash: hashBytes(Buffer.from('[[a.csv]]')),
        });

        expect(await readFile(vault.path(note.trashPath), 'utf8')).toBe('[[a.csv]]');
    });
});

describe('text size boundaries', () => {
    it('paginates and moves Markdown over 5 MiB while refusing edits and oversized CSV reads', async () => {
        const text = 'x'.repeat(5 * 1024 * 1024 + 1);

        vault = await createTestVault({
            'large.md': text,
            'large.csv': text,
        });
        const first = (await readTool(vault.config, { paths: ['large.md'] })).notes[0];

        expect(first).toMatchObject({
            binary: false,
            totalChars: text.length,
            truncated: true,
            hash: hashBytes(Buffer.from(text)),
        });
        expect(first?.content.length).toBeGreaterThan(0);
        const last = (await readTool(vault.config, {
            paths: ['large.md'],
            startChar: text.length - 3,
        })).notes[0];

        expect(last).toMatchObject({
            content: 'xxx',
            truncated: false,
        });
        await expect(readTool(vault.config, { paths: ['large.csv'] }))
            .rejects.toMatchObject({ code: 'file_too_large' });
        await expect(patchTool(vault.config, {
            path: 'large.md',
            expectedHash: first?.hash,
            operations: [
                {
                    type: 'append',
                    text: 'extra',
                },
            ],
        })).rejects.toMatchObject({ code: 'file_too_large' });
        await moveTool(vault.config, {
            path: 'large.md',
            newPath: 'renamed.md',
        });
        expect(await readFile(vault.path('renamed.md'), 'utf8')).toBe(text);
        await expect(readFile(vault.path('large.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('refuses Markdown read and move over 25 MiB without modifying the source', async () => {
        vault = await createTestVault({ 'huge.md': '' });
        await truncate(vault.path('huge.md'), MAX_FILE_BYTES + 1);
        await expect(readTool(vault.config, { paths: ['huge.md'] }))
            .rejects.toMatchObject({ code: 'file_too_large' });
        await expect(moveTool(vault.config, {
            path: 'huge.md',
            newPath: 'renamed.md',
        }))
            .rejects.toMatchObject({ code: 'file_too_large' });
        expect((await readdir(vault.config.root))).toEqual(['huge.md']);
    });

    it('refuses a Markdown edit that would exceed the readable text limit', async () => {
        const original = 'x'.repeat(5 * 1024 * 1024);

        vault = await createTestVault({ 'large.md': original });
        await expect(patchTool(vault.config, {
            path: 'large.md',
            expectedHash: hashBytes(Buffer.from(original)),
            operations: [
                {
                    type: 'append',
                    text: 'extra',
                },
            ],
        })).rejects.toMatchObject({ code: 'file_too_large' });
        expect(await readFile(vault.path('large.md'), 'utf8')).toBe(original);
    });
});
