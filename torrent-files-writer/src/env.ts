function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const KAFKA_BROKERS = requireEnv("KAFKA_BROKERS").split(",");
export const TORRENT_FILES_DIR = requireEnv("TORRENT_FILES_DIR");
