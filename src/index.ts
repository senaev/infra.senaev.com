import Fastify from 'fastify'
import { sendTelegramMessage } from './utils/sendTelegramMessage'

const fastify = Fastify({
  logger: true
})

fastify.get('/*', async (request, reply) => {
    reply.send('Hello, this is media-server-helper.senaev.com service')
})

// curl -X POST http://localhost/tg -H "Content-Type: text/plain" -d 'Hello, world!'
fastify.post('/tg', async (request, reply) => {
    const message = request.body as string

    if (!message) {
        throw new Error('Message is required')
    }

    await sendTelegramMessage(message)

    reply.send({ status: 'ok' })
})

const PORT = 80
// required in Docker so the app accepts connections from the host
const HOST = '0.0.0.0'
fastify.listen({ port: PORT, host: HOST }, (err) => {
  if (err) throw err
  console.log(`🚀 Server is running on port=[${PORT}]`)

  sendTelegramMessage(`🟢 Media server helper is ready`)
})

