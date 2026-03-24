import { parseAlisaCommandWithOpenRouter } from "./openrouter.js";

export async function processAlisaCommand(command: string): Promise<string> {
    const startTime = Date.now();
    console.log(`👉 Start processing command=[${command}]`);

    console.log("👉 Request openRouter");
    const parsed = await parseAlisaCommandWithOpenRouter(command);
    console.log(`✅ Response for command=[${command}], parsed=[${JSON.stringify(parsed)}]`);

    if (parsed.error !== null) {
        console.log(`🤷 Completed with error=[${parsed.error}]`);
        return `Ошибка: ${parsed.error}`;
    }

    const itemsString = parsed.items.join(", ");
    console.log(
        `✅ Successfully parsed list=[${itemsString}] during=[${((Date.now() - startTime) / 1000).toFixed(2)}]s`,
    );

    return `Добавила: ${itemsString}`;
}
