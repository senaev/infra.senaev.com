import { addItemsToSupabaseGroceryList } from "./addItemsToSupabaseGroceryList";
import { getRandomValueFromArray } from "./getRandomValueFromArray";
import { parseAlisaCommandWithOpenRouter } from "./openrouter";

export const ALISA_SKILL_NAME = "Хитрый Батя";

export type HandleTrickyDadRequestResult = {
    responseTextForUser: string;
    openRouterResponseTime: number;
    supabaseResponseTime: number | null;
};

export async function processAlisaCommand(command: string): Promise<HandleTrickyDadRequestResult> {
    const startTime = Date.now();
    let openRouterResponseTime = 0;
    console.log(`👉 Start processing command=[${command}]`);

    console.log("👉 Request openRouter");
    const parsed = await parseAlisaCommandWithOpenRouter(command);
    openRouterResponseTime = Date.now() - startTime;
    console.log(
        `✅ Response from openRouter for command=[${command}], parsed=[${JSON.stringify(parsed)}], openRouterResponseTime=[${openRouterResponseTime}ms]`,
    );

    const { items, error } = parsed;

    if (error !== null) {
        console.log(`❌ Completed with error=[${error}]`);
        return {
            responseTextForUser: `${getRandomValueFromArray([
                "Ошибка искусственного интеллекта",
                "Роботы восстали и не хотят работать",
                "Вы сломали все компьютеры в мире, и они вернули ошибку",
                "Батя опять поругался с искусственным интеллектом, и он не хочет работать, говорит что-то про ошибку",
                "Искусственный интеллект сказал, что не может понять эту команду, и выдал ошибку",
                "Батя пытался поговорить с искусственным интеллектом",
                "Искусственный интеллект на такое не способен",
            ])}: ${error}`,
            openRouterResponseTime,
            supabaseResponseTime: null,
        };
    }

    if (items.length === 0) {
        console.log(`❌ Completed with error=[${error}]`);
        return {
            responseTextForUser: `Батя не понял, что нужно добавить`,
            openRouterResponseTime,
            supabaseResponseTime: null,
        };
    }

    const itemsString = items.join(", ");

    const startTimeSupabase = Date.now();
    let supabaseResponseTime = 0;
    console.log(`👉 Adding items=[${itemsString}] to Supabase`);
    try {
        await addItemsToSupabaseGroceryList(items);
        supabaseResponseTime = Date.now() - startTimeSupabase;
    } catch (err) {
        console.error(`❌ Failed to add items=[${itemsString}] to Supabase:`, err);
        supabaseResponseTime = Date.now() - startTimeSupabase;

        return {
            responseTextForUser: getRandomValueFromArray([
                "Ой, опять что-то не так с базой данных",
                "Батя сломал базу данных, извините",
                "Батя не может настроить формулу в ексельке, попросите попозже",
            ]),
            openRouterResponseTime,
            supabaseResponseTime,
        };
    }
    console.log(`✅ Successfully added items=[${itemsString}] to Supabase`);

    console.log(
        `✅ Successfully parsed and added list=[${itemsString}] during=[${((Date.now() - startTime) / 1000).toFixed(2)}]s`,
    );
    return {
        responseTextForUser: `${getRandomValueFromArray([
            'Добавлено',
            'Добавил',
            'Вот что я добавил',
            'Записал',
            'Добавил, проверяй',
        ])}: ${itemsString}`,
        openRouterResponseTime,
        supabaseResponseTime,
    };
}
