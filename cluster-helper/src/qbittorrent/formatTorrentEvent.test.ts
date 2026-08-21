import {
    describe, expect, it,
} from 'vitest';

import { formatTorrentEvent, TorrentEvent } from './formatTorrentEvent';

function buildEvent(overrides: Partial<TorrentEvent> = {}): TorrentEvent {
    return {
        event: 'torrent_added',
        name: 'Some Release',
        category: 'movies',
        tags: '',
        contentPath: '/downloads/some-release',
        rootPath: '/downloads',
        savePath: '/downloads/completed',
        fileCount: '3',
        sizeBytes: '1073741824',
        tracker: 'https://tracker.example.com/announce',
        ...overrides,
    };
}

describe('formatTorrentEvent', () => {
    // The result is sent to Telegram with HTML parse mode, so an unescaped character in a
    // torrent name would break the message rather than merely look wrong.
    it('escapes HTML in the torrent name', () => {
        const text = formatTorrentEvent(buildEvent({ name: 'Tom & Jerry <1940>' }));

        expect(text).toContain('Tom &amp; Jerry &lt;1940&gt;');
        expect(text).not.toContain('<1940>');
    });

    it('escapes the ampersand before the other entities', () => {
        const text = formatTorrentEvent(buildEvent({ name: '&<' }));

        expect(text).toContain('&amp;&lt;');
        expect(text).not.toContain('&amp;lt;');
    });

    it('reports size and file count for a started download', () => {
        const text = formatTorrentEvent(buildEvent());

        expect(text).toContain('🚀 <b>Началась загрузка:</b> Some Release');
        expect(text).toContain('1.0 GB · 3 files');
    });

    it('uses the singular form for a single file', () => {
        const text = formatTorrentEvent(buildEvent({ fileCount: '1' }));

        expect(text).toContain('1 file');
        expect(text).not.toContain('1 files');
    });

    it('omits the details line when size and file count are unusable', () => {
        const text = formatTorrentEvent(buildEvent({
            fileCount: 'not-a-number',
            sizeBytes: '0',
        }));

        expect(text).not.toContain('💾');
    });

    it('shows only the tracker hostname', () => {
        const text = formatTorrentEvent(buildEvent());

        expect(text).toContain('🌐 tracker.example.com');
    });

    // qBittorrent reports pseudo-trackers such as "** [DHT] **", which are not URLs.
    it('falls back to the raw tracker value when it is not a URL', () => {
        const text = formatTorrentEvent(buildEvent({ tracker: '** [DHT] **' }));

        expect(text).toContain('🌐 ** [DHT] **');
    });

    it('renders the finished template instead of the download details', () => {
        const text = formatTorrentEvent(buildEvent({ event: 'torrent_finished' }));

        expect(text).toContain('🏁 <b>Загрузка завершена:</b> Some Release');
        expect(text).not.toContain('💾');
    });
});
