import { parseAlisaCommandWithOpenRouter } from "./openrouter.js";

export async function processAlisaCommand(command: string): Promise<string> {
    console.log(`👉 Start processing command=[${command}]`);

    console.log("👉 Request openRouter");
    const parsed = await parseAlisaCommandWithOpenRouter(command);
    console.log(`✅ Response for command=[${command}], parsed=[${JSON.stringify(parsed)}]`);

    const result =
        parsed.error === null ? `Добавила: ${parsed.items.join(", ")}` : `Ошибка: ${parsed.error}`;

    console.log(`✅ Finished processing command=[${command}], result=[${result}]`);
    return result;
}
