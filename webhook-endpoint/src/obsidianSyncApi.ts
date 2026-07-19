import { OBSIDIAN_SYNC_URL } from "./env";

export type ObsidianTaskInput = {
    title: string;
    due_date: string | null;
};

/**
 * Resolves a short link id by calling the obsidian-sync container's
 * `GET /short_links/:id` HTTP API, which reads the mapping from the Obsidian
 * vault's short_links.md file.
 *
 * Returns the target URL, or `null` if the short link id is not found.
 */
export async function getShortLink(shortId: string): Promise<string | null> {
    const response = await fetch(
        `${OBSIDIAN_SYNC_URL}/short_links/${encodeURIComponent(shortId)}`,
    );

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error(
            `Failed to resolve short link: ${response.status} ${await response.text()}`,
        );
    }

    const body = (await response.json()) as { status: "ok"; url: string };
    return body.url;
}

/**
 * Creates a task in the Obsidian vault by calling the obsidian-sync container's
 * `POST /tasks` HTTP API, which appends a checkbox line to the Obsidian Tasks
 * streaming file directly on disk.
 */
export async function addObsidianTask(task: ObsidianTaskInput): Promise<void> {
    const response = await fetch(`${OBSIDIAN_SYNC_URL}/tasks`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(task),
    });

    if (!response.ok) {
        throw new Error(
            `Failed to add Obsidian task: ${response.status} ${await response.text()}`,
        );
    }
}
