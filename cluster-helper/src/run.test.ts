import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';

import { run } from './run';

const mocks = vi.hoisted(() => {
    const closed: string[] = [];

    return {
        closed,
        createServer: (name: string) => {
            return {
                listen: () => Promise.resolve(),
                close: () => {
                    closed.push(`${name} server`);

                    return Promise.resolve();
                },
            };
        },
        getCurrentTelegramBotInfo: vi.fn(),
        callTelegramApi: vi.fn(),
    };
});

vi.mock('./env', () => {
    return {
        API_DOMAIN: 'api.test',
        OBSIDIAN_SYNC_URL: 'https://obsidian-sync.test:8443',
        TG_TOKEN_SENAEV_COM_BOT: 'token',
    };
});
vi.mock('./logger', () => {
    return {
        logger: {
            info: vi.fn(),
            error: vi.fn(),
        },
    };
});
vi.mock('./startupTimer', () => {
    return { logStartupStep: vi.fn() };
});
vi.mock('./obsidianSyncApi', () => {
    return {
        createObsidianSyncApi: () => {
            return {};
        },
    };
});
vi.mock('./createInternalServer', () => {
    return { createInternalServer: () => mocks.createServer('internal') };
});
vi.mock('./createPublicServer', () => {
    return {
        TELEGRAM_WEBHOOK_PATH: '/telegram-webhook',
        createPublicServer: () => Promise.resolve(mocks.createServer('public')),
    };
});
vi.mock('./torrentOutbox', () => {
    return {
        startTorrentOutboxProcessor: (subscribeShutdown: (close: () => void) => void) => {
            subscribeShutdown(() => {
                mocks.closed.push('torrent outbox');
            });

            return Promise.resolve();
        },
    };
});
vi.mock('senaev-utils/src/utils/mtls/watchTlsCredentials', () => {
    return {
        watchTlsCredentials: () => Promise.resolve({
            credentials: {},
            stop: () => {
                mocks.closed.push('certificate watcher');
            },
        }),
    };
});
vi.mock('senaev-utils/src/utils/mtls/mtlsClient', () => {
    return {
        createMtlsClient: () => {
            return {
                close: () => {
                    mocks.closed.push('obsidian-sync client');

                    return Promise.resolve();
                },
            };
        },
    };
});
vi.mock('senaev-utils/src/utils/mtls/createMtlsFastifyServer', () => {
    return { createMtlsFastifyServer: () => mocks.createServer('mtls') };
});
vi.mock('senaev-utils/src/utils/TelegramApi/getCurrentTelegramBotInfo', () => {
    return { getCurrentTelegramBotInfo: mocks.getCurrentTelegramBotInfo };
});
vi.mock('senaev-utils/src/utils/TelegramApi/callTelegramApi', () => {
    return { callTelegramApi: mocks.callTelegramApi };
});

const signalHandlers = new Map<string, () => void>();

beforeEach(() => {
    mocks.closed.length = 0;
    signalHandlers.clear();
    mocks.getCurrentTelegramBotInfo.mockReset().mockResolvedValue({ id: 1 });
    mocks.callTelegramApi.mockReset().mockResolvedValue(undefined);
    vi.spyOn(process, 'once').mockImplementation(((event: string, handler: () => void) => {
        signalHandlers.set(event, handler);

        return process;
    }) as typeof process.once);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
});

describe('run', () => {
    it('after SIGTERM stops the outbox, closes the servers, then the client, then the certificate watcher, and exits', async () => {
        await run();

        expect(mocks.closed).toEqual([]);

        signalHandlers.get('SIGTERM')?.();
        await vi.waitFor(() => {
            expect(process.exit).toHaveBeenCalledExactlyOnceWith(0);
        });

        expect(mocks.closed).toEqual([
            'torrent outbox',
            'internal server',
            'public server',
            'mtls server',
            'obsidian-sync client',
            'certificate watcher',
        ]);
    });

    it('throws when the start fails, and leaves the exit to the caller', async () => {
        mocks.getCurrentTelegramBotInfo.mockRejectedValue(new Error('Telegram is down'));

        await expect(run()).rejects.toThrow('Telegram is down');

        expect(process.exit).not.toHaveBeenCalled();
        expect(mocks.closed).toEqual([]);
    });
});
