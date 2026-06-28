import { callTelegramApi } from "senaev-utils/src/utils/TelegramApi/callTelegramApi";
import { createTelegramApiBaseFileUrl } from "senaev-utils/src/utils/TelegramApi/createTelegramApiBaseUrl";
import { GROQ_API_KEY, TG_TOKEN_SENAEV_COM_BOT } from "./env";

const GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_TRANSCRIPTION_MODEL = "whisper-large-v3-turbo";

type TelegramGetFileResult = {
    file_path: string;
};

type GroqTranscriptionResult = {
    text: string;
};

export async function transcribeAudioFile(fileId: string): Promise<string> {
    const fileInfo = await callTelegramApi<TelegramGetFileResult>({
        method: "getFile",
        token: TG_TOKEN_SENAEV_COM_BOT,
        body: { file_id: fileId },
    });

    const fileUrl = `${createTelegramApiBaseFileUrl(TG_TOKEN_SENAEV_COM_BOT)}/${fileInfo.file_path}`;
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
        throw new Error(
            `Failed to download Telegram file: ${fileResponse.status} ${await fileResponse.text()}`,
        );
    }

    const ext = fileInfo.file_path.split(".").pop() ?? "ogg";
    const formData = new FormData();
    formData.append("file", await fileResponse.blob(), `audio.${ext}`);
    formData.append("model", GROQ_TRANSCRIPTION_MODEL);

    const transcriptionResponse = await fetch(GROQ_TRANSCRIPTION_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: formData,
    });

    if (!transcriptionResponse.ok) {
        throw new Error(
            `Groq transcription failed: ${transcriptionResponse.status} ${await transcriptionResponse.text()}`,
        );
    }

    const result = (await transcriptionResponse.json()) as GroqTranscriptionResult;
    return result.text;
}
