import { KafkaMessage } from "kafkajs";
import { TelegramUser } from "../telegram/types";

export type KafkaTopicProcessorArgument = {
    message: KafkaMessage;
    botUser: TelegramUser;
};
