import { isObject } from 'senaev-utils/src/types/Object/Object';
import { createBearerAuthorizationHeader } from 'senaev-utils/src/utils/auth/bearerToken/bearerToken';

import type { VaultToolReply } from './chatGptMcp/handleMcpMessage';
import { INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_OBSIDIAN, OBSIDIAN_SYNC_URL } from './env';

/** A full vault search reads every note, so allow it much more than a normal request. */
const VAULT_TOOL_TIMEOUT_MS = 30_000;

/**
 * Every call to obsidian-sync goes through here, because obsidian-sync rejects any request
 * without the internal token.
 */
export function fetchObsidianSync(pathOrUrl: string | URL, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);

    headers.set('authorization', createBearerAuthorizationHeader(INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_OBSIDIAN));

    const url = typeof pathOrUrl === 'string' ? `${OBSIDIAN_SYNC_URL}${pathOrUrl}` : pathOrUrl;

    return fetch(url, {
        ...init,
        headers,
    });
}

/**
 * Runs a vault tool in obsidian-sync with `POST /vault/<name>`. A reply with
 * `status: "error"` is a normal tool error for ChatGPT; only a transport failure or a
 * reply that is not JSON throws.
 */
export async function callVaultTool(vaultToolName: string, args: unknown): Promise<VaultToolReply> {
    const response = await fetchObsidianSync(`/vault/${encodeURIComponent(vaultToolName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(VAULT_TOOL_TIMEOUT_MS),
    });
    const body: unknown = await response.json();

    if (!isObject(body) || Array.isArray(body)) {
        throw new Error(`obsidian-sync answered HTTP ${response.status} with a body that is not a JSON object`);
    }

    return {
        isError: !response.ok || body.status !== 'ok',
        body,
    };
}

export type ObsidianTaskInput = {
    title: string;
    due_date: string | null;
};

export type Milestone = {
    fileName: string;
    path: string;
    /** The frontmatter property that matched, e.g. `birthday`, `holiday`, `death`. */
    type: string;
    age: number | null;
    emoji: string;
};

export type DayMilestones = {
    /** `YYYY-MM-DD` */
    date: string;
    milestones: Milestone[];
};

export type MilestonesOverview = {
    today: DayMilestones;
    tomorrow: DayMilestones;
};

/**
 * Collects the milestones (birthdays, holidays, ...) of a day and of the day after it by
 * calling the obsidian-sync container's `GET /milestones` HTTP API. Without `date`,
 * obsidian-sync uses its own idea of today.
 */
export async function getMilestones(date?: string): Promise<MilestonesOverview> {
    const query = date === undefined ? '' : `?date=${encodeURIComponent(date)}`;
    const response = await fetchObsidianSync(`/milestones${query}`);

    const body = (await response.json()) as
        | ({ status: 'ok' } & MilestonesOverview)
        | { status: 'error'; message: string };

    if (!response.ok || body.status !== 'ok') {
        throw new Error(`Failed to get milestones: ${body.status === 'error' ? body.message : `HTTP ${response.status}`}`);
    }

    return {
        today: body.today,
        tomorrow: body.tomorrow,
    };
}

/**
 * Resolves a short link id by calling the obsidian-sync container's
 * `GET /short_links/:id` HTTP API, which reads the mapping from the Obsidian
 * vault's short_links.md file.
 *
 * Returns the target URL, or `null` if the short link id is not found.
 */
export async function getShortLink(shortId: string): Promise<string | null> {
    const response = await fetchObsidianSync(`/short_links/${encodeURIComponent(shortId)}`);

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error(`Failed to resolve short link: ${response.status} ${await response.text()}`);
    }

    const body = (await response.json()) as { status: 'ok'; url: string };

    return body.url;
}

/**
 * Creates a new short link by calling the obsidian-sync container's
 * `POST /short_links` HTTP API, which validates the link and appends it to
 * the Obsidian vault's short_links.md file.
 *
 * Returns the newly assigned short link id. Throws with the obsidian-sync
 * error message (e.g. an invalid link) on failure.
 */
export async function createShortLink(link: string): Promise<string> {
    const response = await fetchObsidianSync('/short_links', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ link }),
    });

    const body = (await response.json()) as
        | { status: 'ok'; id: string }
        | { status: 'error'; message: string };

    if (!response.ok || body.status !== 'ok') {
        throw new Error(body.status === 'error' ? body.message : `HTTP ${response.status}`);
    }

    return body.id;
}

/**
 * Creates a task in the Obsidian vault by calling the obsidian-sync container's
 * `POST /tasks` HTTP API, which appends a checkbox line to the Obsidian Tasks
 * streaming file directly on disk.
 */
export async function addObsidianTask(task: ObsidianTaskInput): Promise<void> {
    const response = await fetchObsidianSync('/tasks', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(task),
    });

    if (!response.ok) {
        throw new Error(`Failed to add Obsidian task: ${response.status} ${await response.text()}`);
    }
}

/**
 * Creates several tasks in the Obsidian vault.
 *
 * The writes must stay sequential: `POST /tasks` does a read-modify-write of a
 * single vault file, so concurrent requests would overwrite each other and lose
 * tasks. The list is also written back-to-front because each request prepends
 * its line to the top of the file — writing in reverse leaves the tasks in the
 * vault in the same order the user said them.
 */
export async function addObsidianTasks(tasks: ObsidianTaskInput[]): Promise<void> {
    for (const task of [...tasks].reverse()) {
        await addObsidianTask(task);
    }
}
