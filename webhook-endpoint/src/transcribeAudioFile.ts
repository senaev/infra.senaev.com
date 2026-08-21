import { downloadFileFromTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/downloadFileFromTelegramMessage';

import { GROQ_API_KEY, TG_TOKEN_SENAEV_COM_BOT } from './env';

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_TRANSCRIPTION_MODEL = 'whisper-large-v3-turbo';

type GroqTranscriptionResult = {
    text: string;
};

export async function transcribeAudioFile(fileId: string): Promise<string> {
    const { bytes, filePath } = await downloadFileFromTelegramMessage({
        fileId,
        token: TG_TOKEN_SENAEV_COM_BOT,
    });

    const GROQ_ACCEPTED_EXTENSIONS = new Set([
        'flac',
        'mp3',
        'mp4',
        'mpeg',
        'mpga',
        'm4a',
        'ogg',
        'opus',
        'wav',
        'webm',
    ]);
    const rawExt = filePath.split('.').pop() ?? '';
    const ext = GROQ_ACCEPTED_EXTENSIONS.has(rawExt) ? rawExt : 'ogg';
    const formData = new FormData();

    formData.append('file', new Blob([bytes]), `audio.${ext}`);
    formData.append('model', GROQ_TRANSCRIPTION_MODEL);

    const transcriptionResponse = await fetch(GROQ_TRANSCRIPTION_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: formData,
    });

    if (!transcriptionResponse.ok) {
        throw new Error(`Groq transcription failed: ${transcriptionResponse.status} ${await transcriptionResponse.text()}`);
    }

    const result = (await transcriptionResponse.json()) as GroqTranscriptionResult;

    return result.text;
}
