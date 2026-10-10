import { isObject } from 'senaev-utils/src/types/Object/Object';

import { logger } from '../logger';

import type { CallVaultTool } from './handleMcpMessage';

const VAULT_RULES_PATH = 'AGENTS.md';

// ChatGPT weighs the first 512 characters of the instructions most, so the header says what
// the text is and what to do if the rest is missing.
const HEADER = 'The text below is the root AGENTS.md of the owner\'s Obsidian vault: the rules for every vault workflow. ' + 'Follow them whenever you use an obsidian- tool. If the text looks cut off, read AGENTS.md with obsidian-read.';

export const VAULT_RULES_FALLBACK = 'Before any vault workflow, read the root AGENTS.md with obsidian-read and follow its rules.';

function readNoteContent(body: Record<string, unknown>): string | null {
    const [note] = Array.isArray(body.notes) ? body.notes : [];

    return isObject(note) && typeof note.content === 'string' ? note.content : null;
}

/**
 * The MCP `instructions` for a new session: the live AGENTS.md, read through the generic
 * obsidian-read vault tool on every `initialize`, so an edit in Obsidian is used at once.
 * Never throws: without the file, the session still starts with the fallback sentence.
 */
export async function loadVaultInstructions(callVaultTool: CallVaultTool): Promise<string> {
    try {
        const reply = await callVaultTool('read', { paths: [VAULT_RULES_PATH] });
        const content = reply.isError ? null : readNoteContent(reply.body);

        if (content !== null) {
            return `${HEADER}\n\n${content}`;
        }

        logger.warn({ body: reply.body }, '⚠️ Could not read the vault rules for the MCP instructions');
    } catch (error) {
        logger.warn(error, '⚠️ Could not read the vault rules for the MCP instructions');
    }

    return VAULT_RULES_FALLBACK;
}
