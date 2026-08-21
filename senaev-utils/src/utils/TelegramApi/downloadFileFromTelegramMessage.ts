import { callTelegramApi } from './callTelegramApi';
import { createTelegramApiBaseFileUrl } from './createTelegramApiBaseUrl';

async function getFile({
    fileId,
    token,
}: {
    fileId: string;
    token: string;
}): Promise<{ file_path: string }> {
    const result = await callTelegramApi<{ file_path: string; file_id: string }>({
        method: 'getFile',
        token,
        body: {
            file_id: fileId,
        },
    });

    return { file_path: result.file_path };
}

/**
 * Downloads the bytes behind a Telegram file id.
 *
 * `filePath` is returned alongside the bytes because the Bot API never sends a file name —
 * the extension in this server-side path is the only hint at the real file type, and callers
 * that re-upload the bytes elsewhere need it.
 */
export async function downloadFileFromTelegramMessage({
    fileId,
    token,
}: {
    fileId: string;
    token: string;
}): Promise<{ bytes: ArrayBuffer; filePath: string }> {
    const telegramApiBaseFileUrl = createTelegramApiBaseFileUrl(token);
    const { file_path } = await getFile({
        fileId,
        token,
    });
    const res = await fetch(`${telegramApiBaseFileUrl}/${file_path}`);

    if (!res.ok) {
        throw new Error(`downloadFile failed: ${res.status} ${await res.text()}`);
    }

    return {
        bytes: await res.arrayBuffer(),
        filePath: file_path,
    };
}
