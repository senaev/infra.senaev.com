import { escapeTelegramMarkdown } from 'senaev-utils/src/utils/TelegramApi/formatTelegramMarkdown/formatTelegramMarkdown';

import {
    type ClaudeLogin, type ClaudeLoginDependencies, createClaudeLogin,
} from './claudeLogin';
import { logger } from './logger';
import {
    createMcpDialog, type McpDialog, type McpDialogDependencies,
} from './mcpDialog';
import { createPendingLoginSlot } from './pendingLogin';

export type AssistantDependencies = ClaudeLoginDependencies & McpDialogDependencies;

// The Claude login and the MCP dialog share one waiting login: the next text message is its code.
export type LoginAssistant = ClaudeLogin & McpDialog & {
    // Returns true when the text was taken as a login code or a redirect URL, so the caller can
    // delete the message.
    handleText(text: string): Promise<boolean>;
    stop(): void;
};

export function createLoginAssistant(dependencies: AssistantDependencies): LoginAssistant {
    const slot = createPendingLoginSlot();

    return {
        ...createClaudeLogin(dependencies, slot),
        ...createMcpDialog(dependencies, slot),

        async handleText(text) {
            const waiting = slot.take();

            if (waiting === null) {
                await dependencies.sendMarkdown(escapeTelegramMarkdown('No login is waiting for a code. Send /auth or /mcp to start one.'));

                return false;
            }

            const result = await waiting.session.submitCode(text.trim());

            // The text was taken as a code, so the caller must get `true` and delete the message,
            // also when the status or the answer to the user fails.
            try {
                await waiting.report(result);
            } catch (error) {
                logger.error(error, '❌ Could not report the result of the login');
            }

            return true;
        },

        stop() {
            slot.cancel();
        },
    };
}
