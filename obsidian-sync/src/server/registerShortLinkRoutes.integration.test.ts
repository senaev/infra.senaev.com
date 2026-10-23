import {
    mkdir, readFile, rm, writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
    afterAll, afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { withFileMutation } from 'senaev-utils/src/files/withFileMutation';

import { SHORT_LINKS_FILE_PATH } from '../vaultPaths';

import { createVaultServer, type VaultServer } from './createVaultServer';
import { registerShortLinkRoutes } from './registerShortLinkRoutes';

vi.mock('../vaultPaths', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const vault = fs.mkdtempSync(`${os.tmpdir()}/short-links-test-`);

    return {
        SHORT_LINKS_FILE_PATH: `${vault}/short_links/short_links.csv`,
    };
});

const paths = {
    vault: dirname(dirname(SHORT_LINKS_FILE_PATH)),
    csv: SHORT_LINKS_FILE_PATH,
};

let server: VaultServer;

beforeEach(async () => {
    await mkdir(join(paths.vault, 'short_links'), { recursive: true });
    server = createVaultServer();
    registerShortLinkRoutes(server);
    await server.ready();
});

afterEach(async () => {
    await server.close();
    await rm(join(paths.vault, 'short_links'), {
        recursive: true,
        force: true,
    });
});

afterAll(async () => {
    await rm(paths.vault, {
        recursive: true,
        force: true,
    });
});

async function resolve(id: string) {
    const response = await server.inject({
        method: 'GET',
        url: `/short_links/${id}`,
    });

    return response.statusCode === 200 ? response.json<{ url: string }>().url : response.statusCode;
}

async function create(link: string) {
    return await server.inject({
        method: 'POST',
        url: '/short_links',
        payload: { link },
    });
}

describe('short link routes', () => {
    it('creates the table with the first link, and appends the next ones', async () => {
        const first = await create('https://example.com/a');
        const second = await create('https://example.com/?b=1,2');
        const firstId = first.json<{ id: string }>().id;
        const secondId = second.json<{ id: string }>().id;

        expect(first.statusCode).toBe(201);
        expect(await resolve(firstId)).toBe('https://example.com/a');
        expect(await resolve(secondId)).toBe('https://example.com/?b=1,2');
        expect(await readFile(paths.csv, 'utf8')).toBe(`id,url\n${firstId},https://example.com/a\n${secondId},"https://example.com/?b=1,2"\n`);
    });

    it('reads a table changed by hand, and keeps its extra columns on append', async () => {
        await writeFile(paths.csv, 'id,url,comment\na1,https://example.com/a,first\nevil01,javascript:alert(1),\n');

        expect(await resolve('a1')).toBe('https://example.com/a');
        expect(await resolve('evil01')).toBe(404);

        const { id } = (await create('https://example.com/b')).json<{ id: string }>();

        expect(await readFile(paths.csv, 'utf8')).toBe(`id,url,comment\na1,https://example.com/a,first\nevil01,javascript:alert(1),\n${id},https://example.com/b,\n`);
    });

    it('answers 409 while another tool edits the table', async () => {
        let release!: () => void;
        const editing = withFileMutation(paths.csv, () => new Promise<void>((done) => {
            release = done;
        }), createCommandExecution());

        expect((await create('https://example.com/a')).statusCode).toBe(409);
        release();
        await editing;
    });

    it.each([
        'javascript:alert(1)',
        'data:text/html,x',
        'not a url',
    ])('refuses to create a short link to %s', async (link) => {
        const response = await create(link);

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ message: 'Field "link" must be a valid http(s) URL' });
    });
});
