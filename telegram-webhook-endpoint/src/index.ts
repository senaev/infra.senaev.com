import http from "node:http";
import {
  PORT,
  WEBHOOK_PATH,
  WEBHOOK_DOMAIN,
  KAFKA_TOPIC,
  MAX_BODY_SIZE,
  webhookSecretToken,
} from "./config.js";
import { telegramApiCall } from "./telegram-api.js";
import {
  connectProducer,
  sendMessage,
  disconnectProducer,
} from "./kafka-producer.js";

const server = http.createServer((req, res) => {
  if (req.method === "GET") {
    res.writeHead(200);
    res.end("Telegram Webhook Endpoint Works!");
    return;
  }

  if (req.method === "POST" && req.url === WEBHOOK_PATH) {
    const secret = req.headers["x-telegram-bot-api-secret-token"];
    if (secret !== webhookSecretToken) {
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }

    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        req.destroy();
        res.writeHead(413);
        res.end("Payload Too Large");
      }
    });
    req.on("end", () => {
      if (body.length > MAX_BODY_SIZE) return;
      sendMessage(KAFKA_TOPIC, body)
        .then(() => {
          res.writeHead(200);
          res.end("OK");
        })
        .catch((err: unknown) => {
          console.error("Failed to send to Kafka:", err);
          res.writeHead(500);
          res.end("Error");
        });
    });
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

async function main(): Promise<void> {
  await connectProducer();
  console.log("Connected to Kafka");

  await new Promise<void>((resolve) =>
    server.listen(PORT, "0.0.0.0", resolve),
  );
  console.log(`Server listening on port=${PORT}`);

  const webhookUrl = `https://${WEBHOOK_DOMAIN}${WEBHOOK_PATH}`;
  await telegramApiCall("setWebhook", {
    url: webhookUrl,
    secret_token: webhookSecretToken,
  });
  console.log(`Webhook set to url=${webhookUrl}`);
}

function shutdown(): void {
  console.log("Shutting down...");
  server.close(() => {
    disconnectProducer().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
