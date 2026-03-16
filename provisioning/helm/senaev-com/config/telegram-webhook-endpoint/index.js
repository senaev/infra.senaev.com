const { Kafka } = require('kafkajs')

const kafka = new Kafka({
  brokers: [process.env.KAFKA_BROKERS]
})

const producer = kafka.producer()

async function run() {
  await producer.connect()
  console.log('Connected to Kafka')
  let i = 1
  while (true) {
    await producer.send({
      topic: 'telegram-webhook-data',
      messages: [{ value: `hello, world ${i}` }]
    })
    console.log(`Sent: hello, world ${i}`)
    i++
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

run().catch((err) => console.error(err))
