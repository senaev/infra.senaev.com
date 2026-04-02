import { parseAlisaCommandWithOpenRouter } from "./openrouter";

export const ALISA_SKILL_NAME = "Хитрый Батя";

export type HandleTrickyDadRequestResult = {
    responseTextForUser: string;
    openRouterResponseTime: number;
};

export async function processAlisaCommand(command: string): Promise<HandleTrickyDadRequestResult> {
    const startTime = Date.now();
    console.log(`👉 Start processing command=[${command}]`);

    console.log("👉 Request openRouter");
    const parsed = await parseAlisaCommandWithOpenRouter(command);
    const openRouterResponseTime = Date.now() - startTime;
    console.log(
        `✅ Response for command=[${command}], parsed=[${JSON.stringify(parsed)}], openRouterResponseTime=[${openRouterResponseTime}ms]`,
    );

    const { items, error } = parsed;

    if (error !== null) {
        console.log(`🤷 Completed with error=[${error}]`);
        return {
            responseTextForUser: `Ошибка искусственного интеллекта: ${error}`,
            openRouterResponseTime,
        };
    }

    const itemsString = items.join(", ");
    console.log(
        `✅ Successfully parsed list=[${itemsString}] during=[${((Date.now() - startTime) / 1000).toFixed(2)}]s`,
    );

    return { responseTextForUser: `Добавлено: ${itemsString}`, openRouterResponseTime };
}
