import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { TASKS_FILE_PATH } from "../vaultPaths";

/** Puts `line` at the very top, separated from existing content by a blank line. */
function prependToContent(content: string, line: string): string {
    const trimmed = content.trimStart();
    if (!trimmed) {
        return `${line}\n`;
    }
    return `${line}\n\n${trimmed}`;
}

function isNotFoundError(error: unknown): boolean {
    return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

/** Prepends `line` to the tasks file, creating the file (and folders) if needed. */
export async function prependTaskLine(line: string): Promise<void> {
    await mkdir(dirname(TASKS_FILE_PATH), { recursive: true });

    let content = "";
    try {
        content = await readFile(TASKS_FILE_PATH, "utf8");
    } catch (error) {
        if (!isNotFoundError(error)) {
            throw error;
        }
    }

    await writeFile(TASKS_FILE_PATH, prependToContent(content, line), "utf8");
}
