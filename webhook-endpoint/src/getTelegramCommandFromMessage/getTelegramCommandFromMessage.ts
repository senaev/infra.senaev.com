export interface TelegramCommand {
    commandName: string;
    botName?: string;
}

export function getTelegramCommandFromMessage(text: string): TelegramCommand | undefined {
    if (!text) {
        return undefined;
    }

    const match = text.match(/^\/([A-Za-z0-9_]+)(?:@([A-Za-z0-9_]+))?(?:\s|$)/);
    if (!match) {
        return undefined;
    }

    const commandName = match[1];
    if (!commandName) {
        return undefined;
    }

    const botName = match[2];
    return botName ? { commandName, botName } : { commandName };
}
