import Fastify from "fastify"
import {
  getMe,
  getUpdates,
  setWebhook,
  sendTelegramMessage,
} from "./telegram/api"
import type { TelegramUpdate } from "./telegram/types"
import { TG_CHANNEL_ID } from "./const/TG_CHANNEL_ID"
import { processChannelPost } from "./telegram/processChannelPost"
import { TelegramLastUpdateId } from "./telegram/TelegramLastUpdateId"
import { randomBytes } from "crypto"

const HOST = "0.0.0.0"
const INTERNAL_PORT = 3000
const PUBLIC_PORT = 8080

const WEBHOOK_BASE_URL = "https://telegram-webhook-endpoint.senaev.com"
const WEBHOOK_PATH = "/telegram-webhook"
const WEBHOOK_URL = `${WEBHOOK_BASE_URL}${WEBHOOK_PATH}`

const webhookSecretToken = randomBytes(32).toString("hex")

const internalServer = Fastify({ logger: true })
internalServer.get("/*", async (_request, reply) => {
  reply.send("internalServer OK")
})

internalServer.post<{ Body: string }>("/tg", async (request, reply) => {
  const message = request.body as string
  if (!message) {
    throw new Error("Message is required")
  }
  await sendTelegramMessage(message)
  reply.send({ status: "ok" })
})

const publicServer = Fastify({ logger: true })
publicServer.get("/*", async (_request, reply) => {
  reply.send("publicServer OK")
})

async function runCatchUp(botUserId: number): Promise<void> {
  let offset = TelegramLastUpdateId.load() + 1
  for (;;) {
    const updates = await getUpdates(offset)
    if (updates.length === 0) break
    for (const u of updates) {
      offset = Math.max(offset, u.update_id + 1)
      const msg = u.channel_post ?? u.edited_channel_post
      if (msg && String(msg.chat.id) === TG_CHANNEL_ID) {
        await processChannelPost(msg, botUserId)
      }
    }
    TelegramLastUpdateId.save(offset - 1)
  }
  TelegramLastUpdateId.save(offset > 0 ? offset - 1 : 0)
}

async function main(): Promise<void> {
  const botUser = await getMe()
  
  publicServer.post<{ Body: unknown; headers: { "x-telegram-bot-api-secret-token"?: string } }>(
    WEBHOOK_PATH,
    async (request, reply) => {
      const secret = request.headers["x-telegram-bot-api-secret-token"]
      if (!secret || secret !== webhookSecretToken) {
        return reply.status(401).send({ error: "Unauthorized" })
      }
      const body = request.body as TelegramUpdate
      const message = body.channel_post ?? body.edited_channel_post
      if (message) {
        processChannelPost(message, botUser.id).catch((err) =>
          request.log.error(err, "processChannelPost failed")
        )
      }
      reply.send({ ok: true })
    }
  )

  await internalServer.listen({ port: INTERNAL_PORT, host: HOST })
  console.log(`[media-server-helper-internal] listening on port ${INTERNAL_PORT}`)

  await publicServer.listen({ port: PUBLIC_PORT, host: HOST })
  console.log(`[media-server-helper-public] listening on port ${PUBLIC_PORT}`)

  try {
    await runCatchUp(botUser.id)
  } catch (err) {
    console.warn("[catch-up] failed (continuing):", err)
  }

  await setWebhook(WEBHOOK_URL, webhookSecretToken)
  console.log(`[webhook] set to ${WEBHOOK_URL}`)

  await sendTelegramMessage("🟢 Media server helper is ready")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
