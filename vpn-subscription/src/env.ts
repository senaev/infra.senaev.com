function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

type SubscriptionEntry = {
    name: string;
    link: string;
};

function parseEntries(raw: string): SubscriptionEntry[] {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
        throw new Error("Subscription entries must be an array");
    }

    return parsed.map((entry, index) => {
        if (typeof entry !== "object" || entry === null) {
            throw new Error(`Subscription entry at index ${index} must be an object`);
        }

        const { name, link } = entry as Record<string, unknown>;
        if (typeof name !== "string" || name.length === 0) {
            throw new Error(
                `Subscription entry at index ${index} must have a non-empty string name`,
            );
        }

        if (typeof link !== "string" || link.length === 0) {
            throw new Error(
                `Subscription entry at index ${index} must have a non-empty string link`,
            );
        }

        return { name, link };
    });
}

export const PORT = 3000;
export const VPN_SUBSCRIPTION_CHAT_ID = requireEnv("VPN_SUBSCRIPTION_CHAT_ID");
export const VPN_SUBSCRIPTION_SECRET = requireEnv("VPN_SUBSCRIPTION_SECRET");
export const VPN_SUBSCRIPTION_CHAT = requireEnv("VPN_SUBSCRIPTION_CHAT");
export const XRAY_USER_UUID = requireEnv("XRAY_USER_UUID");
export const XRAY_REALITY_PUBLIC_KEY = requireEnv("XRAY_REALITY_PUBLIC_KEY");
export const SUBSCRIPTION_ENTRIES = parseEntries(requireEnv("SUBSCRIPTION_ENTRIES"));
