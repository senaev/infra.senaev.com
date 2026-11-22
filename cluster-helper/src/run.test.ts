import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';

import { run } from './run';

const mocks = vi.hoisted(() => {
    const closed: string[] = [];

    const failingServers = new Set<string>();

    return {
        closed,
        failingServers,
        publicServerWebhookSecretToken: undefined as string | undefined,
        loggerError: vi.fn(),
        createServer: (name: string) => {
            return {
                listen: () => Promise.resolve(),
                close: () => {
                    closed.push(`${name} server`);

                    return failingServers.has(name)
                        ? Promise.reject(new Error(`${name} server failed to close`))
                        : Promise.resolve();
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
        TG_CLUSTER_CHAT_ID: 1,
        OBSIDIAN_SYNC_URL: 'https://obsidian-sync.test:8443',
        TG_TOKEN_SENAEV_COM_BOT: 'token',
    };
});
vi.mock('./logger', () => {
    return {
        logger: {
            info: vi.fn(),
            error: mocks.loggerError,
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
vi.mock('./alerts/alertingHeartbeatMonitor', () => {
    return {
        createAlertingHeartbeatMonitor: () => {
            return {
                start: vi.fn(),
                stop: () => {
                    mocks.closed.push('alerting heartbeat monitor');
                },
            };
        },
    };
});
vi.mock('./createInternalServer', () => {
    return { createInternalServer: () => mocks.createServer('internal') };
});
vi.mock('./createPublicServer', () => {
    return {
        TELEGRAM_WEBHOOK_PATH: '/telegram-webhook',
        createPublicServer: ({ webhookSecretToken }: { webhookSecretToken: string }) => {
            mocks.publicServerWebhookSecretToken = webhookSecretToken;

            return Promise.resolve(mocks.createServer('public'));
        },
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
let exited: Promise<number | undefined>;

beforeEach(() => {
    mocks.closed.length = 0;
    mocks.failingServers.clear();
    mocks.publicServerWebhookSecretToken = undefined;
    mocks.loggerError.mockReset();
    signalHandlers.clear();
    mocks.getCurrentTelegramBotInfo.mockReset().mockResolvedValue({ id: 1 });
    mocks.callTelegramApi.mockReset().mockResolvedValue(undefined);
    vi.spyOn(process, 'once').mockImplementation(((event: string, handler: () => void) => {
        signalHandlers.set(event, handler);

        return process;
    }) as typeof process.once);
    exited = new Promise((resolve) => {
        vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
            resolve(code);
        }) as typeof process.exit);
    });
});

describe('run', () => {
    it('after SIGTERM stops the outbox, closes the servers, then the heartbeat monitor, the client and the certificate watcher, and exits', async () => {
        await run();

        expect(mocks.closed).toEqual([]);

        signalHandlers.get('SIGTERM')?.();

        expect(await exited).toBe(0);
        expect(mocks.closed).toEqual([
            'torrent outbox',
            'internal server',
            'public server',
            'mtls server',
            'alerting heartbeat monitor',
            'obsidian-sync client',
            'certificate watcher',
        ]);
    });

    it('closes the other servers, the client and the watcher when one server fails to close, then exits with 1', async () => {
        mocks.failingServers.add('internal');
        await run();

        signalHandlers.get('SIGTERM')?.();

        expect(await exited).toBe(1);
        expect(mocks.closed).toEqual([
            'torrent outbox',
            'internal server',
            'public server',
            'mtls server',
            'alerting heartbeat monitor',
            'obsidian-sync client',
            'certificate watcher',
        ]);
        expect(mocks.loggerError).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ errors: [expect.objectContaining({ message: 'internal server failed to close' })] }),
            expect.any(String)
        );
    });

    it('gives Telegram the same webhook secret that the public server checks', async () => {
        await run();

        expect(mocks.publicServerWebhookSecretToken).toMatch(/^[0-9a-f]{64}$/u);
        expect(mocks.callTelegramApi).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            method: 'setWebhook',
            body: expect.objectContaining({ secret_token: mocks.publicServerWebhookSecretToken }),
        }));
    });

    it('throws when the start fails, and leaves the exit to the caller', async () => {
        mocks.getCurrentTelegramBotInfo.mockRejectedValue(new Error('Telegram is down'));

        await expect(run()).rejects.toThrow('Telegram is down');

        expect(process.exit).not.toHaveBeenCalled();
        expect(mocks.closed).toEqual([]);
    });
});
