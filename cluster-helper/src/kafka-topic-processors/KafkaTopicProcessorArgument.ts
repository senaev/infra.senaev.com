import { KafkaMessage } from "kafkajs";
import { TelegramUser } from "senaev-utils/src/utils/TelegramApi/types";

export type KafkaTopicProcessorArgument = {
    message: KafkaMessage;
    botUser: TelegramUser;
};
