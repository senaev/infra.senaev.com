import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';

import { logger } from '../logger';

import { handleAlisaRequest } from './handleAlisaRequest';
import { runTrickyDadCommand } from './runTrickyDadCommand';
import { sendTrickyDadErrorReport } from './sendTrickyDadReport';

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
    vi.mocked(sendTrickyDadErrorReport).mockResolvedValue(undefined);
});

describe('handleAlisaRequest', () => {
    it.each([
        '',
        '   ',
        '\n\t',
    ])('does not dispatch an empty launch command [%s]', (command) => {
        const response = handleAlisaRequest({ request: { command } });

        expect(response).toBe('Ничего не понял. Можете, пожалуйста, повторить?');
        expect(sendTrickyDadErrorReport).toHaveBeenCalledWith({
            command,
            err: expect.objectContaining({ message: 'Empty command received from Alisa' }),
        });
        expect(runTrickyDadCommand).not.toHaveBeenCalled();
    });

    it('logs only the command, not the request JSON', () => {
        vi.mocked(runTrickyDadCommand).mockReturnValue(new Promise(() => {}));

        handleAlisaRequest({
            request: {
                command: 'купи хлеб',
                original_utterance: 'Купи хлеб',
            },
            session: { user: { user_id: 'secret-user-id' } },
        });

        expect(vi.mocked(logger.info)).toHaveBeenCalledWith({ command: 'купи хлеб' }, '🆕 Received Alisa command');
        expect(JSON.stringify(vi.mocked(logger.info).mock.calls)).not.toMatch(/secret-user-id|original_utterance/);
    });
});
