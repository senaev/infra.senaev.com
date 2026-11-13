import { OPENROUTER_API_KEY, API_DOMAIN } from '../env';

export type LlmProvider = {
    name: string;
    url: string;
    model: string;
    headers: Record<string, string>;
    timeoutMs: number;
    maxTokens: number | null;
};

const OPENROUTER_TIMEOUT_MS = 60_000;

export const OPENROUTER_PROVIDER: LlmProvider = {
    name: 'openrouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'google/gemini-3-flash-preview',
    headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': `https://${API_DOMAIN}`,
        'X-Title': 'senaev.com cluster-helper',
    },
    timeoutMs: OPENROUTER_TIMEOUT_MS,
    maxTokens: null,
};
