import {
    describe,
    expect,
    it,
} from 'vitest';

import { getTelegramCommandFromMessage } from './getTelegramCommandFromMessage';

describe('getTelegramCommandFromMessage', () => {
    it('should return undefined for empty text', () => {
        expect(getTelegramCommandFromMessage('')).toBeUndefined();
    });

    it('should return undefined for text without a telegram command', () => {
        expect(getTelegramCommandFromMessage('hello world')).toBeUndefined();
    });

    it('should return undefined when slash is not followed by command name', () => {
        expect(getTelegramCommandFromMessage('/')).toBeUndefined();
    });

    it('should parse a command without bot name or argument', () => {
        expect(getTelegramCommandFromMessage('/start')).toEqual({
            botName: undefined,
            commandArgument: '',
            commandName: 'start',
        });
    });

    it('should parse a command with bot name', () => {
        expect(getTelegramCommandFromMessage('/start@test_bot')).toEqual({
            botName: 'test_bot',
            commandArgument: '',
            commandName: 'start',
        });
    });

    it('should parse a command argument and trim surrounding whitespace', () => {
        expect(getTelegramCommandFromMessage('/echo   hello world   ')).toEqual({
            botName: undefined,
            commandArgument: 'hello world',
            commandName: 'echo',
        });
    });

    it('should parse a command with bot name and multiline argument', () => {
        expect(getTelegramCommandFromMessage('/echo@test_bot\nhello world')).toEqual({
            botName: 'test_bot',
            commandArgument: 'hello world',
            commandName: 'echo',
        });
    });

    it('should allow digits and underscores in command and bot names', () => {
        expect(getTelegramCommandFromMessage('/command_123@bot_456 arg')).toEqual({
            botName: 'bot_456',
            commandArgument: 'arg',
            commandName: 'command_123',
        });
    });

    it('should return undefined when command is not at the start of the message', () => {
        expect(getTelegramCommandFromMessage('text /start')).toBeUndefined();
    });

    it('should return undefined when command is followed by a non-whitespace character', () => {
        expect(getTelegramCommandFromMessage('/start!')).toBeUndefined();
    });
});
