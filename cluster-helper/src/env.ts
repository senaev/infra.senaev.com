function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const TOKEN_senaev_com_bot = requireEnv("TOKEN_senaev_com_bot");
export const TG_MEDIA_SERVER_CHANNEL_ID = requireEnv(
  "TG_MEDIA_SERVER_CHANNEL_ID",
);
export const TG_CLUSTER_CHAT_ID = requireEnv("TG_CLUSTER_CHAT_ID");
export const KAFKA_BROKERS = requireEnv("KAFKA_BROKERS").split(",");
export const WATCH_TORRENT_FILES_DIR = requireEnv("WATCH_TORRENT_FILES_DIR");
