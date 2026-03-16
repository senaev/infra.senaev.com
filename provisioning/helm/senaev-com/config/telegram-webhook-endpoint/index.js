const https = require("https");
const http = require("http");
const { randomBytes } = require("crypto");
const { Kafka } = require("kafkajs");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN;
const KAFKA_BROKERS = process.env.KAFKA_BROKERS;
const KAFKA_TOPIC = process.env.KAFKA_TOPIC;
const PORT = 3000;
const WEBHOOK_PATH = "/telegram-webhook";
const MAX_BODY_SIZE = 1_000_000;

const webhookSecretToken = randomBytes(32).toString("hex");

function telegramApiCall(method, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${TELEGRAM_BOT_TOKEN}/${method}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk) => (responseBody += chunk));
        res.on("end", () => resolve(JSON.parse(responseBody)));
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

const kafka = new Kafka({ brokers: [KAFKA_BROKERS] });
const producer = kafka.producer();

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
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        req.destroy();
        res.writeHead(413);
        res.end("Payload Too Large");
      }
    });
    req.on("end", () => {
      if (body.length > MAX_BODY_SIZE) return;
      producer
        .send({
          topic: KAFKA_TOPIC,
          messages: [{ value: body }],
        })
        .then(() => {
          res.writeHead(200);
          res.end("OK");
        })
        .catch((err) => {
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

async function main() {
  await producer.connect();
  console.log("👉 Connected to Kafka");

  await new Promise((resolve) => server.listen(PORT, "0.0.0.0", resolve));
  console.log(`✅ Server listening on port=[${PORT}]`);

  const webhookUrl = `https://${WEBHOOK_DOMAIN}${WEBHOOK_PATH}`;
  await telegramApiCall("setWebhook", {
    url: webhookUrl,
    secret_token: webhookSecretToken,
  });
  console.log(
    `✅ Webhook set to url=[${webhookUrl}] with webhookSecretToken=[${webhookSecretToken}]`,
  );
}

function shutdown() {
  console.log("Shutting down...");
  server.close(() => {
    producer.disconnect().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
