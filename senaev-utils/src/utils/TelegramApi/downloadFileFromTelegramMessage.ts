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

export async function downloadFileFromTelegramMessage({
    fileId,
    token,
}: {
    fileId: string;
    token: string;
}): Promise<ArrayBuffer> {
    const telegramApiBaseFileUrl = createTelegramApiBaseFileUrl(token);
    const { file_path } = await getFile({
        fileId,
        token,
    });
    const res = await fetch(`${telegramApiBaseFileUrl}/${file_path}`);

    if (!res.ok) {
        throw new Error(`downloadFile failed: ${res.status}`);
    }

    return res.arrayBuffer();
}
