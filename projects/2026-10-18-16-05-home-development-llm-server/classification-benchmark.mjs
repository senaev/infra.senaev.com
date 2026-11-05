// Russian message classification benchmark for llm-server (step 9).
// Runs inside a pod that may call the API, for example:
//   curl -fsSL <raw URL of this file> \
//     | kubectl -n senaev-com exec -i deploy/n8n -c n8n -- node --input-type=module -
// Every text here is synthetic and public.

const LLM_SERVER_URL = process.env.LLM_SERVER_URL ?? 'http://llm-server:8080';

const CATEGORIES = {
    finance: 'деньги, банк, счета, налоги, платежи',
    work: 'работа, коллеги, задачи, созвоны, HR',
    personal: 'семья, друзья, личные просьбы',
    shopping: 'заказы, доставка, покупки, отзывы о товарах',
    health: 'врачи, анализы, самочувствие',
    travel: 'поездки, билеты, рейсы, отели',
    home: 'дом, быт, ЖКХ, соседи, домашние устройства и серверы',
    news: 'новости, события в мире, сообщения СМИ',
    spam: 'реклама, рассылки, мошенничество',
};
const SENTIMENTS = [
    'positive',
    'neutral',
    'negative',
];

const SYSTEM_PROMPT = `Ты классифицируешь входящие сообщения на русском языке.
Ответь только JSON-объектом без пояснений: {"category": "...", "sentiment": "...", "urgent": true|false}.

category — одно из:
${Object.entries(CATEGORIES).map(([
    id,
    description,
]) => `- ${id}: ${description}`).join('\n')}

sentiment — тон автора сообщения: ${SENTIMENTS.join(', ')}.
urgent — true, только если получателю нужно что-то сделать в ближайшие 24 часа. Мошенничество и реклама не срочные.`;

// An array lists every answer that counts as correct for an ambiguous text.
const CASES = [
    {
        text: 'Списание 1 290 ₽ по карте *4417, ЯНДЕКС ПЛЮС. Доступно: 23 511 ₽',
        category: 'finance',
        sentiment: 'neutral',
        urgent: false,
    },
    {
        text: 'Андрей, привет! Созвон по релизу переносим на 16:00 сегодня, скинь, пожалуйста, до обеда статус по задаче INFRA-212.',
        category: 'work',
        sentiment: 'neutral',
        urgent: true,
    },
    {
        text: 'Поздравляем! Вы выиграли iPhone 17! Для получения приза перейдите по ссылке и оплатите доставку 299 ₽',
        category: 'spam',
        sentiment: [
            'positive',
            'neutral',
        ],
        urgent: false,
    },
    {
        text: 'Сынок, ты почему не звонишь? Папа немного приболел, ничего страшного, но позвони вечером.',
        category: 'personal',
        sentiment: [
            'negative',
            'neutral',
        ],
        urgent: true,
    },
    {
        text: 'Пылесос купил месяц назад — уже сломался мотор, поддержка не отвечает неделю. Деньги на ветер.',
        category: 'shopping',
        sentiment: 'negative',
        urgent: false,
    },
    {
        text: 'Напоминаем: приём у стоматолога завтра, 6 ноября, в 9:30. Для отмены ответьте НЕТ.',
        category: 'health',
        sentiment: 'neutral',
        urgent: true,
    },
    {
        text: 'Ваш рейс SU 1234 Москва — Калининград сегодня задерживается до 21:40. Приносим извинения за неудобства.',
        category: 'travel',
        sentiment: [
            'negative',
            'neutral',
        ],
        urgent: [
            true,
            false,
        ],
    },
    {
        text: '🔥 [FIRING] Диск /mnt/sdb1 на senaev-media заполнен на 97%. Осталось 28 ГБ.',
        category: 'home',
        sentiment: [
            'negative',
            'neutral',
        ],
        urgent: true,
    },
    {
        text: 'ЦБ сохранил ключевую ставку на уровне 16,5% годовых. Регулятор допускает её снижение в начале следующего года.',
        category: [
            'news',
            'finance',
        ],
        sentiment: 'neutral',
        urgent: false,
    },
    {
        text: 'Ну спасибо, «Почта России», посылка шла всего-то два месяца. Обожаю.',
        category: 'shopping',
        sentiment: 'negative',
        urgent: false,
    },
    {
        text: 'Ты огонь! Фотки с выходных просто супер, давай в следующий раз опять в горы 😍',
        category: 'personal',
        sentiment: 'positive',
        urgent: false,
    },
    {
        text: 'Добрый день! Напоминаем, что сегодня до 18:00 нужно заполнить самооценку в Workday. После этого форма закроется.',
        category: 'work',
        sentiment: 'neutral',
        urgent: true,
    },
    {
        text: 'Начислено за октябрь: 6 842,17 ₽ за отопление и воду. Оплатить до 25 ноября.',
        category: [
            'finance',
            'home',
        ],
        sentiment: 'neutral',
        urgent: false,
    },
    {
        text: 'бро, деплой упал, под в CrashLoopBackOff, глянь плиз asap 🙏',
        category: [
            'work',
            'home',
        ],
        sentiment: 'negative',
        urgent: true,
    },
    {
        text: 'Анализы готовы: гемоглобин и ферритин в норме, витамин D низкий — врач рекомендует добавку 2000 МЕ.',
        category: 'health',
        sentiment: 'neutral',
        urgent: false,
    },
    {
        text: 'Только до воскресенья! Скидки до 70% на всю зимнюю коллекцию. Отписаться: ответьте STOP',
        category: 'spam',
        sentiment: [
            'positive',
            'neutral',
        ],
        urgent: false,
    },
    {
        text: 'Бронирование подтверждено: отель «Морской бриз», Сочи, 12–15 декабря, 2 взрослых. Оплата при заселении.',
        category: 'travel',
        sentiment: [
            'positive',
            'neutral',
        ],
        urgent: false,
    },
    {
        text: 'Служба безопасности Сбербанка: по вашей карте подозрительная операция. Срочно назовите код из SMS нашему оператору.',
        category: 'spam',
        sentiment: [
            'negative',
            'neutral',
        ],
        urgent: false,
    },
    {
        text: 'Здравствуйте, это соседка снизу из 45-й. У нас с потолка капает вода, вы дома? Срочно перекройте кран!',
        category: 'home',
        sentiment: 'negative',
        urgent: true,
    },
    {
        text: 'Google представила новую открытую модель Gemma. По словам компании, она работает даже на ноутбуках без видеокарты.',
        category: 'news',
        sentiment: [
            'neutral',
            'positive',
        ],
        urgent: false,
    },
    {
        text: 'ФНС: срок уплаты имущественных налогов — 1 декабря. Сумма к уплате: 3 412 ₽.',
        category: 'finance',
        sentiment: 'neutral',
        urgent: false,
    },
    {
        text: 'Спасибо за ревью, все замечания поправил, мёрджу 👍',
        category: 'work',
        sentiment: 'positive',
        urgent: false,
    },
    {
        text: 'Робот-пылесос завершил уборку. Убрано 42 м², контейнер для пыли заполнен — очистите его.',
        category: 'home',
        sentiment: 'neutral',
        urgent: [
            false,
            true,
        ],
    },
    {
        text: 'Отель — кошмар: в номере плесень, кондиционер не работает, на ресепшене хамят. Больше никогда.',
        category: [
            'travel',
            'shopping',
        ],
        sentiment: 'negative',
        urgent: false,
    },
    {
        text: 'У ребёнка температура 39,5 уже второй день, что делать? Вызывать врача?',
        category: [
            'health',
            'personal',
        ],
        sentiment: 'negative',
        urgent: true,
    },
    {
        text: 'Купи по дороге хлеба и молока, пожалуйста.',
        category: [
            'personal',
            'shopping',
        ],
        sentiment: 'neutral',
        urgent: true,
    },
];

const RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        category: {
            type: 'string',
            enum: Object.keys(CATEGORIES),
        },
        sentiment: {
            type: 'string',
            enum: SENTIMENTS,
        },
        urgent: { type: 'boolean' },
    },
    required: [
        'category',
        'sentiment',
        'urgent',
    ],
    additionalProperties: false,
};

// "schema" constrains the output with a grammar, as an n8n workflow would. "free" only asks
// for JSON in the prompt, and shows how well the model follows the format by itself.
const MODES = [
    'schema',
    'free',
];
const FIELDS = [
    'category',
    'sentiment',
    'urgent',
];

async function getModelName() {
    const response = await fetch(`${LLM_SERVER_URL}/v1/models`);
    const body = await response.json();

    return body.data?.[0]?.id ?? 'unknown';
}

async function classify(text, mode) {
    const request = {
        temperature: 0,
        max_tokens: 60,
        messages: [
            {
                role: 'system',
                content: SYSTEM_PROMPT,
            },
            {
                role: 'user',
                content: text,
            },
        ],
    };

    if (mode === 'schema') {
        request.response_format = {
            type: 'json_schema',
            json_schema: {
                name: 'classification',
                schema: RESPONSE_SCHEMA,
            },
        };
    }

    const startedAt = Date.now();
    const response = await fetch(`${LLM_SERVER_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });
    const body = await response.json();
    const content = body.choices?.[0]?.message?.content ?? '';

    return {
        content,
        answer: parseAnswer(content),
        ms: Date.now() - startedAt,
    };
}

function parseAnswer(content) {
    const json = content.match(/\{[\s\S]*\}/)?.[0];

    if (!json) {
        return null;
    }

    try {
        return JSON.parse(json);
    } catch {
        return null;
    }
}

function isCorrect(expected, actual) {
    return [expected].flat().includes(actual);
}

async function runMode(mode) {
    const score = {
        valid: 0,
        allCorrect: 0,
        totalMs: 0,
        category: 0,
        sentiment: 0,
        urgent: 0,
    };
    const mistakes = [];

    for (const [
        index,
        testCase,
    ] of CASES.entries()) {
        const {
            content, answer, ms,
        } = await classify(testCase.text, mode);

        score.totalMs += ms;
        if (!answer) {
            mistakes.push(`#${index + 1} invalid JSON: ${JSON.stringify(content)}`);
            continue;
        }

        score.valid++;

        const wrongFields = FIELDS.filter((field) => !isCorrect(testCase[field], answer[field]));

        for (const field of FIELDS) {
            if (!wrongFields.includes(field)) {
                score[field]++;
            }
        }

        if (wrongFields.length === 0) {
            score.allCorrect++;
            continue;
        }

        const details = wrongFields.map((field) => `${field}=${answer[field]} (expected ${[testCase[field]].flat().join('|')})`);

        mistakes.push(`#${index + 1} ${details.join(', ')} — ${testCase.text.slice(0, 60)}`);
    }

    return {
        score,
        mistakes,
    };
}

function formatScore(mode, score) {
    const total = CASES.length;

    return [
        mode.padEnd(8),
        `valid ${score.valid}/${total}`,
        `category ${score.category}/${total}`,
        `sentiment ${score.sentiment}/${total}`,
        `urgent ${score.urgent}/${total}`,
        `all ${score.allCorrect}/${total}`,
        `avg ${Math.round(score.totalMs / total)} ms`,
    ].join(' | ');
}

function print(line) {
    process.stdout.write(`${line}\n`);
}

print(`Model: ${await getModelName()}, ${CASES.length} cases`);
for (const mode of MODES) {
    const { score, mistakes } = await runMode(mode);

    print(`\n${formatScore(mode, score)}`);
    for (const mistake of mistakes) {
        print(`  ${mistake}`);
    }
}
