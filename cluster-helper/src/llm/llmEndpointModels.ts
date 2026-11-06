export type LlmEndpointModel = {
    id: string;
    ownedBy: string;
    chatCompletionsUrl: string;
};

/** The models of the /llm endpoint: only models that run in the cluster. */
export function getLlmEndpointModels(llmServerUrl: string | null): LlmEndpointModel[] {
    if (llmServerUrl === null) {
        return [];
    }

    return [
        {
            id: 'home/qwen3-4b',
            ownedBy: 'senaev-media',
            chatCompletionsUrl: `${llmServerUrl}/v1/chat/completions`,
        },
    ];
}
