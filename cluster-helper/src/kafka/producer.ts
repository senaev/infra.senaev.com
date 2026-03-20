import { Kafka } from "kafkajs";
import { KAFKA_BROKERS } from "../env";

const kafka = new Kafka({ brokers: KAFKA_BROKERS });
const producer = kafka.producer();

export async function connectProducer(): Promise<void> {
  await producer.connect();
}

export async function sendMessage(
  topic: string,
  value: Buffer,
  headers?: Record<string, string>,
): Promise<void> {
  await producer.send({
    topic,
    messages: [
      {
        value,
        ...(headers && { headers }),
      },
    ],
  });
}

export async function disconnectProducer(): Promise<void> {
  await producer.disconnect();
}
