export const TG_CHANNEL_ID: string = process.env.TG_CHANNEL_ID as string;

if (!TG_CHANNEL_ID) {
    throw new Error('TG_CHANNEL_ID is not set');
}
