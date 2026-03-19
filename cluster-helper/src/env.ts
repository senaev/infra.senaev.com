function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const TOKEN_senaev_com_bot = requireEnv("TOKEN_senaev_com_bot");
export const TG_CHANNEL_ID = requireEnv("TG_CHANNEL_ID");
export const KAFKA_BROKERS = requireEnv("KAFKA_BROKERS").split(",");
export const KAFKA_TOPIC = requireEnv("KAFKA_TOPIC");
export const TG_SEND_TOPIC = requireEnv("TG_SEND_TOPIC");
export const WATCH_TORRENT_FILES_DIR = requireEnv("WATCH_TORRENT_FILES_DIR");
