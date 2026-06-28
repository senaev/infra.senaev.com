import { TelegramMessage } from "senaev-utils/src/utils/TelegramApi/types";
import { transcribeAudioFile } from "./transcribeAudioFile";

type TelegramAudioFile = {
    file_id: string;
};

export async function parseTextOrAudioMessageFromTelegram(
    message: TelegramMessage,
): Promise<string | null> {
    if (message.text) {
        return message.text;
    }

    const { voice, audio } = message as unknown as {
        voice?: TelegramAudioFile;
        audio?: TelegramAudioFile;
    };
    const audioFile = voice ?? audio;

    if (!audioFile) {
        return null;
    }

    return transcribeAudioFile(audioFile.file_id);
}
