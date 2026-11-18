import {
    describe, expect, it, vi,
} from 'vitest';

import { handleAlertmanagerWebhookInternal } from './handleAlertmanagerWebhook';

vi.mock('../env', () => {
    return {
        TG_CLUSTER_CHAT_ID: 'chat',
        TG_TOKEN_SENAEV_COM_BOT: 'token',
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

function createAlert({
    labels = {},
    annotations = {},
}: {
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
} = {}) {
    return {
        status: 'firing',
        startsAt: '2026-11-18T02:11:00Z',
        endsAt: '0001-01-01T00:00:00Z',
        generatorURL: 'https://grafana.senaev.com/alerting',
        labels: {
            alertname: 'node-disk-space-low',
            alertgroup: 'node-disk',
            severity: 'warning',
            ...labels,
        },
        annotations,
    };
}

function getMessage(alert: ReturnType<typeof createAlert>): string {
    const [item] = handleAlertmanagerWebhookInternal({ alerts: [alert] });

    if (!item) {
        throw new Error('No alert item');
    }

    return item.message;
}

describe('handleAlertmanagerWebhookInternal', () => {
    it('puts the VPS, summary, time, job and pod each on its own line', () => {
        const message = getMessage(createAlert({
            labels: {
                node: 'galkin',
                job: 'node-exporter',
                pod: 'vm-stack-prometheus-node-exporter-x8dzm',
            },
            annotations: { summary: '3.7GiB free on / (/dev/vda1)' },
        }));
        const [header] = message.split('</details>');
        const visibleLines = header?.split('<details>')[0]?.trim().split('  \n');

        expect(visibleLines).toEqual([
            '🔴⚠️ **node\\-disk\\-space\\-low** [🔗](https://grafana.senaev.com/alerting)',
            '**VPS:** `galkin`',
            '**Summary:** 3\\.7GiB free on / \\(/dev/vda1\\)',
            '**Time:** 18\\-11\\-2026 02:11:00',
            '**Job:** `node-exporter`',
            '**Pod:** `vm-stack-prometheus-node-exporter-x8dzm`',
        ]);
    });

    it('skips the lines of missing labels instead of failing', () => {
        const message = getMessage(createAlert());

        expect(message).not.toContain('**VPS:**');
        expect(message).not.toContain('**Job:**');
        expect(message).not.toContain('**Pod:**');
        expect(message).toContain('**Time:**');
    });
});
