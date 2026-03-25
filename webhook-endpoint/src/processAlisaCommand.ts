import { parseAlisaCommandWithOpenRouter } from "./openrouter.js";

export const ALISA_SKILL_NAME = "Хитрый Батя";

export async function processAlisaCommand(command: string): Promise<string> {
    const startTime = Date.now();
    console.log(`👉 Start processing command=[${command}]`);

    console.log("👉 Request openRouter");
    const parsed = await parseAlisaCommandWithOpenRouter(command);
    console.log(`✅ Response for command=[${command}], parsed=[${JSON.stringify(parsed)}]`);

    const { items, error } = parsed;

    if (error !== null) {
        console.log(`🤷 Completed with error=[${error}]`);
        return `Ошибка: ${error}`;
    }

    const itemsString = items.join(", ");
    console.log(
        `✅ Successfully parsed list=[${itemsString}] during=[${((Date.now() - startTime) / 1000).toFixed(2)}]s`,
    );

    // for (const item of items) {
    //     console.log(`👉 Add item to Google Keep item=[${item}]`);
    //     await addItemToGoogleKeepList(item);
    //     console.log(`✅ Added item to Google Keep item=[${item}]`);
    // }

    return `Добавила: ${itemsString}`;
}
