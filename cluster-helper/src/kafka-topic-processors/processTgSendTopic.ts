import { forwardTelegramApiCall, type TelegramForwardPayload } from "../telegram/api";
import { KafkaTopicProcessorArgument } from "./KafkaTopicProcessorArgument";

/**
 * Forward Telegram API request from Kafka to Telegram API as-is.
 *
 * Expected Kafka message value:
 * {"method":"sendMessage","body":{"chat_id":"123","text":"Hello"}}
 */
export async function processTgSendTopic({
    message: { value },
}: KafkaTopicProcessorArgument): Promise<void> {
    if (!value) {
        throw new Error("❌ Consumed message with no value from Tg Send topic");
    }

    const raw = value.toString();

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw new Error(`❌ Failed to parse tg-send-topic payload as JSON: ${String(error)}`);
    }

    if (typeof parsed !== "object" || parsed === null) {
        throw new Error("❌ Invalid tg-send-topic payload: expected a JSON object");
    }

    if (!("method" in parsed)) {
        throw new Error('❌ Invalid tg-send-topic payload: missing required field "method"');
    }

    if (typeof parsed.method !== "string" || parsed.method.length === 0) {
        throw new Error(
            '❌ Invalid tg-send-topic payload: field "method" must be a non-empty string',
        );
    }

    if (
        "body" in parsed &&
        parsed.body !== undefined &&
        (typeof parsed.body !== "object" || parsed.body === null || Array.isArray(parsed.body))
    ) {
        throw new Error('❌ Invalid tg-send-topic payload: field "body" must be an object');
    }

    await forwardTelegramApiCall(parsed as TelegramForwardPayload);
}
