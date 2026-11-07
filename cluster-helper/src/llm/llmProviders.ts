import {
    LLM_SERVER_URL, OPENROUTER_API_KEY, WEBHOOK_DOMAIN,
} from '../env';

export type LlmProvider = {
    name: string;
    url: string;
    model: string;
    headers: Record<string, string>;
    timeoutMs: number;
    maxTokens: number | null;
};

// Qwen3-4B on the iGPU of senaev-media: ~17 tokens/s for the prompt, ~4 tokens/s for the
// answer. A prompt that is not in the cache yet can take ~40 s.
const LLM_SERVER_TIMEOUT_MS = 90_000;
const LLM_SERVER_MAX_TOKENS = 1024;

const OPENROUTER_TIMEOUT_MS = 60_000;

export const LLM_SERVER_PROVIDER: LlmProvider = {
    name: 'llm-server',
    url: `${LLM_SERVER_URL}/v1/chat/completions`,
    // llama-server serves one model and ignores this field.
    model: 'default',
    headers: {},
    timeoutMs: LLM_SERVER_TIMEOUT_MS,
    maxTokens: LLM_SERVER_MAX_TOKENS,
};

export const OPENROUTER_PROVIDER: LlmProvider = {
    name: 'openrouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'google/gemini-3-flash-preview',
    headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': `https://${WEBHOOK_DOMAIN}`,
        'X-Title': 'senaev.com cluster-helper',
    },
    timeoutMs: OPENROUTER_TIMEOUT_MS,
    maxTokens: null,
};

/** LLM provider fallback: try the home llm-server first (if enabled), then OpenRouter. */
export function getLlmProviderFallbackOrder(): LlmProvider[] {
    return LLM_SERVER_URL
        ? [
            LLM_SERVER_PROVIDER,
            OPENROUTER_PROVIDER,
        ]
        : [OPENROUTER_PROVIDER];
}
