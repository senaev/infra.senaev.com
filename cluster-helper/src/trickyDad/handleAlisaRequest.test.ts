import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';

import { handleAlisaRequest } from './handleAlisaRequest';
import { runTrickyDadCommand } from './runTrickyDadCommand';
import { TRICKY_DAD_FUNNY_RESPONSES } from './TRICKY_DAD_FUNNY_RESPONSES';

vi.mock('../env', () => {
    return {
        TG_TOKEN_SENAEV_COM_BOT: 'token',
        OBSIDIAN_TASKS_CHAT_ID: 'tasks-chat',
    };
});

vi.mock('../logger', () => {
    return {
        logger: {
            info: vi.fn(),
            error: vi.fn(),
        },
    };
});

vi.mock('./runTrickyDadCommand', () => {
    return { runTrickyDadCommand: vi.fn() };
});

vi.mock('./sendTrickyDadReport', () => {
    return {
        sendTrickyDadReport: vi.fn(),
        sendTrickyDadErrorReport: vi.fn(),
    };
});

beforeEach(() => {
    vi.clearAllMocks();
});

describe('handleAlisaRequest', () => {
    it.each([
        '',
        '   ',
        '\n\t',
    ])('does not dispatch an empty launch command [%s]', (command) => {
        const response = handleAlisaRequest({ request: { command } });

        expect(TRICKY_DAD_FUNNY_RESPONSES).toContain(response);
        expect(runTrickyDadCommand).not.toHaveBeenCalled();
    });
});
