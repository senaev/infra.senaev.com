import Fastify from "fastify";
import { Kafka, type EachMessagePayload } from "kafkajs";
import { KAFKA_BROKERS, KAFKA_TOPIC, TG_SEND_TOPIC } from "./env";
import {
  formatTorrentEvent,
  isTorrentEvent,
} from "./qbittorrent/formatTorrentEvent";
import { getMe, sendTelegramMessage } from "./telegram/api";
import { processChannelPost } from "./telegram/processChannelPost";
import type { TelegramUpdate } from "./telegram/types";

const HOST = "0.0.0.0";
const PORT = 80;

const server = Fastify({ logger: true });
server.get("/*", async (_request, reply) => {
  reply.send("server OK");
});

async function handleTgSend(raw: string): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await sendTelegramMessage(raw);
    return;
  }

  if (isTorrentEvent(parsed)) {
    await sendTelegramMessage(formatTorrentEvent(parsed), "HTML");
    return;
  }

  await sendTelegramMessage(raw);
}

async function main(): Promise<void> {
  const botUser = await getMe();

  const kafka = new Kafka({ brokers: KAFKA_BROKERS });
  const consumer = kafka.consumer({ groupId: "media-server-helper" });

  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });
  await consumer.subscribe({ topic: TG_SEND_TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }: EachMessagePayload) => {
      if (!message.value) {
        console.error("Consumed message with no value");
        return;
      }

      if (topic === TG_SEND_TOPIC) {
        await handleTgSend(message.value.toString());
        return;
      }

      const update = JSON.parse(message.value.toString()) as TelegramUpdate;
      const post = update.channel_post;
      if (post) {
        await processChannelPost(post, botUser.id);
        return;
      }

      console.error("Received message is not a channel_post");
    },
  });

  await server.listen({ port: PORT, host: HOST });
  console.log(`[media-server-helper] listening on port ${PORT}`);

  await sendTelegramMessage("🟢 Media server helper is ready");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
