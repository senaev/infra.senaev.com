import { OBSIDIAN_SYNC_URL } from "./env";

export type ObsidianTaskInput = {
    title: string;
    due_date: string | null;
};

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
