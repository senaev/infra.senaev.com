import { TG_VPN_SUBSCRIPTION_CHAT_ID } from "./env";

export const IGNORED_CHATS_WHITELIST = new Map<string, string>([
    [TG_VPN_SUBSCRIPTION_CHAT_ID, "VPN_SUBSCRIPTION"],
]);
