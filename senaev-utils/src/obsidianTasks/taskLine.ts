import { isIsoDay, type IsoDay } from './isoDay';
import { validateRecurrence } from './taskRecurrence';

// A task line in the emoji format of the Obsidian Tasks plugin, e.g.
// `- [ ] Reimburse mobile phone 🌱 Agent ⏫ 🔁 every month 📅 2026-11-01`.
// The parser reads every field the plugin reads, in the same way, so that a task means
// the same here and in Obsidian. The model keeps only the fields we support; a line with
// any other field does not serialize back to itself and therefore cannot be edited.

export const TASK_STATUSES = [
    'open',
    'done',
    'cancelled',
] as const;

export type TaskStatus = typeof TASK_STATUSES[number];

/** From the highest to the lowest, as the Tasks plugin numbers them (0 to 5). */
export const TASK_PRIORITIES = [
    'highest',
    'high',
    'medium',
    'normal',
    'low',
    'lowest',
] as const;

export type TaskPriority = typeof TASK_PRIORITIES[number];

export type TaskFields = {
    status: TaskStatus;
    description: string;
    /** Who created the task: `🌱 <source>` at the end of the description. */
    source: string | null;
    priority: TaskPriority;
    /** 📅 */
    dueDate: IsoDay | null;
    /** ✅ when done, ❌ when cancelled, `null` when open. */
    closedDate: IsoDay | null;
    /** 🔁, verbatim, including ` when done`. */
    recurrence: string | null;
};

export type TaskLineParseResult =
    | { ok: true; task: TaskFields; isTopLevel: boolean }
    | { ok: false; error: string };

const PRIORITY_EMOJI: Record<TaskPriority, string> = {
    highest: '🔺',
    high: '⏫',
    medium: '🔼',
    normal: '',
    low: '🔽',
    lowest: '⏬',
};

const STATUS_SYMBOL: Record<TaskStatus, string> = {
    open: ' ',
    done: 'x',
    cancelled: '-',
};

const STATUS_BY_SYMBOL: Readonly<Record<string, TaskStatus>> = {
    ' ': 'open',
    x: 'done',
    X: 'done',
    '-': 'cancelled',
};

const SOURCE_EMOJI = '🌱';

/** The Tasks plugin task regex: indentation or callout `>`, a list marker, a checkbox. */
const TASK_LINE = /^([\s\t>]*)([-*+]|[0-9]+[.)]) +\[(.)\] *(.*)$/u;

const BLOCK_LINK = / \^[a-zA-Z0-9-]+$/u;

const TRAILING_TAG = /(^|\s)(#[^\s!@#$%^&*(),.?":{}|<>]+)$/u;

const DATE = '(\\d{4}-\\d{2}-\\d{2})';

type FieldName = 'priority' | 'start' | 'scheduled' | 'due' | 'done' | 'cancelled' | 'created' | 'recurrence' | 'onCompletion' | 'dependsOn' | 'id';

/** Every field of the plugin's emoji format; the plugin reads them from the end of the line. */
const FIELDS: ReadonlyArray<{ name: FieldName; pattern: RegExp; isDate?: true }> = [
    {
        name: 'priority',
        pattern: /(🔺|⏫|🔼|🔽|⏬)\uFE0F?$/u,
    },
    {
        name: 'start',
        pattern: new RegExp(`🛫\\uFE0F? *${DATE}$`, 'u'),
        isDate: true,
    },
    {
        name: 'scheduled',
        pattern: new RegExp(`[⏳⌛]\\uFE0F? *${DATE}$`, 'u'),
        isDate: true,
    },
    {
        name: 'due',
        pattern: new RegExp(`(?:📅|📆|🗓)\\uFE0F? *${DATE}$`, 'u'),
        isDate: true,
    },
    {
        name: 'done',
        pattern: new RegExp(`✅\\uFE0F? *${DATE}$`, 'u'),
        isDate: true,
    },
    {
        name: 'cancelled',
        pattern: new RegExp(`❌\\uFE0F? *${DATE}$`, 'u'),
        isDate: true,
    },
    {
        name: 'created',
        pattern: new RegExp(`➕\\uFE0F? *${DATE}$`, 'u'),
        isDate: true,
    },
    {
        name: 'recurrence',
        pattern: /🔁\uFE0F? *([a-zA-Z0-9, !]+)$/u,
    },
    {
        name: 'onCompletion',
        pattern: /🏁\uFE0F? *([a-zA-Z]+)$/u,
    },
    {
        name: 'dependsOn',
        pattern: /⛔\uFE0F? *([a-zA-Z0-9-_]+( *, *[a-zA-Z0-9-_]+ *)*)$/u,
    },
    {
        name: 'id',
        pattern: /🆔\uFE0F? *([a-zA-Z0-9-_]+)$/u,
    },
];

const MAX_FIELD_RUNS = 20;

/** The plugin's loop: take fields and tags off the end until nothing matches. */
function readFields(body: string): { rest: string; fields: Partial<Record<FieldName, string>>; tags: string[] } {
    let rest = body.replace(BLOCK_LINK, '').trim();
    const fields: Partial<Record<FieldName, string>> = {};
    const tags: string[] = [];

    for (let run = 0; run < MAX_FIELD_RUNS; run += 1) {
        let isMatched = false;

        for (const { name, pattern } of FIELDS) {
            const match = pattern.exec(rest);

            if (match !== null) {
                fields[name] = (match[1] ?? '').trim();
                rest = rest.slice(0, match.index).trim();
                isMatched = true;
            }
        }

        const tag = TRAILING_TAG.exec(rest);

        if (tag !== null) {
            tags.unshift(tag[2] ?? '');
            rest = rest.slice(0, tag.index).trim();
            isMatched = true;
        }

        if (!isMatched) {
            break;
        }
    }

    return {
        rest,
        fields,
        tags,
    };
}

function splitSource(text: string): { description: string; source: string | null } {
    const match = new RegExp(`^(.*) ${SOURCE_EMOJI} (\\S(?:.*\\S)?)$`, 'u').exec(text);

    if (match === null) {
        return {
            description: text,
            source: null,
        };
    }

    return {
        description: (match[1] ?? '').trim(),
        source: match[2] ?? null,
    };
}

function findInvalidDate(fields: Partial<Record<FieldName, string>>): string | null {
    for (const { name, isDate } of FIELDS) {
        const value = fields[name];

        if (isDate === true && value !== undefined && !isIsoDay(value)) {
            return `invalid ${name} date "${value}"`;
        }
    }

    return null;
}

function readClosedDate(status: TaskStatus, fields: Partial<Record<FieldName, string>>): IsoDay | null {
    switch (status) {
    case 'done': return fields.done ?? null;
    case 'cancelled': return fields.cancelled ?? null;
    default: return null;
    }
}

/** `null` when the line is not a task line at all. */
export function parseTaskLine(line: string): TaskLineParseResult | null {
    const match = TASK_LINE.exec(line);

    if (match === null) {
        return null;
    }

    const [
        ,
        indentation = '',
        listMarker = '',
        statusSymbol = '',
        body = '',
    ] = match;
    const status = STATUS_BY_SYMBOL[statusSymbol];

    if (status === undefined) {
        return {
            ok: false,
            error: `unknown status "[${statusSymbol}]"`,
        };
    }

    const {
        rest, fields, tags,
    } = readFields(body);
    const invalidDate = findInvalidDate(fields);

    if (invalidDate !== null) {
        return {
            ok: false,
            error: invalidDate,
        };
    }

    if (fields.recurrence !== undefined) {
        const recurrenceError = validateRecurrence(fields.recurrence);

        if (recurrenceError !== null) {
            return {
                ok: false,
                error: recurrenceError,
            };
        }
    }

    const { description, source } = splitSource([
        rest,
        ...tags,
    ].filter((part) => part !== '').join(' '));
    const priorityEmoji = fields.priority;
    const priority = TASK_PRIORITIES.find((name) => priorityEmoji !== undefined && PRIORITY_EMOJI[name] === priorityEmoji.replace('\uFE0F', '')) ?? 'normal';

    return {
        ok: true,
        isTopLevel: indentation === '' && listMarker === '-',
        task: {
            status,
            description,
            source,
            priority,
            dueDate: fields.due ?? null,
            closedDate: readClosedDate(status, fields),
            recurrence: fields.recurrence ?? null,
        },
    };
}

/** The line in the order the Tasks plugin itself writes the fields. */
export function serializeTask(task: TaskFields): string {
    const closedEmoji = task.status === 'cancelled' ? '❌' : '✅';
    const parts = [
        `- [${STATUS_SYMBOL[task.status]}] ${task.description}`,
        task.source === null ? '' : ` ${SOURCE_EMOJI} ${task.source}`,
        task.priority === 'normal' ? '' : ` ${PRIORITY_EMOJI[task.priority]}`,
        task.recurrence === null ? '' : ` 🔁 ${task.recurrence}`,
        task.dueDate === null ? '' : ` 📅 ${task.dueDate}`,
        task.closedDate === null || task.status === 'open' ? '' : ` ${closedEmoji} ${task.closedDate}`,
    ];

    return parts.join('');
}

export type TaskEditBlocker = {
    reason: string;
    /** The line as this tool would write the parsed task. */
    expected: string;
    actual: string;
};

/**
 * A task can be edited only when it is a top-level `- [ ]` line in exactly our format,
 * so that rewriting it cannot change or drop anything the owner wrote.
 */
export function findTaskEditBlocker(line: string, parsed: Extract<TaskLineParseResult, { ok: true }>): TaskEditBlocker | null {
    const expected = serializeTask(parsed.task);

    if (!parsed.isTopLevel) {
        return {
            reason: 'Only a top-level "- [ ]" task can be edited, not a nested, callout or numbered one',
            expected,
            actual: line,
        };
    }

    if (expected !== line) {
        return {
            reason: 'The task line is not in the format this tool writes (e.g. an unsupported field, another field order or extra spaces), so it cannot be edited safely',
            expected,
            actual: line,
        };
    }

    return null;
}

const TASK_FIELD_KEYS: ReadonlyArray<keyof TaskFields> = [
    'status',
    'description',
    'source',
    'priority',
    'dueDate',
    'closedDate',
    'recurrence',
];

function isSameTask(a: TaskFields, b: TaskFields): boolean {
    return TASK_FIELD_KEYS.every((key) => a[key] === b[key]);
}

/**
 * Checks the fields of a task to write. The written line must read back as the same
 * fields, so for example a description that ends with "📅 2026-01-01" is refused.
 * Returns an error message, or `null` when the task is valid.
 */
export function findTaskFieldsError(task: TaskFields): string | null {
    if (task.description.trim() === '' || task.description !== task.description.trim()) {
        return '"description" must not be empty or start or end with spaces';
    }

    if (/[\r\n]/.test(task.description) || (task.source !== null && /[\r\n]/.test(task.source))) {
        return '"description" and "source" must be one line';
    }

    if (task.source !== null && (task.source.trim() !== task.source || task.source === '' || task.source.includes(SOURCE_EMOJI))) {
        return `"source" must not be empty, start or end with spaces, or contain ${SOURCE_EMOJI}`;
    }

    for (const [
        key,
        value,
    ] of [
            [
                'dueDate',
                task.dueDate,
            ],
            [
                'closedDate',
                task.closedDate,
            ],
        ] as const) {
        if (value !== null && !isIsoDay(value)) {
            return `"${key}" must be a real day in YYYY-MM-DD format`;
        }
    }

    if (task.status === 'open' && task.closedDate !== null) {
        return '"closedDate" can be set only for a done or cancelled task';
    }

    if (task.recurrence !== null) {
        const recurrenceError = validateRecurrence(task.recurrence);

        if (recurrenceError !== null) {
            return `"recurrence": ${recurrenceError}`;
        }

        if (task.dueDate === null) {
            return 'A recurring task needs "dueDate"';
        }
    }

    const reread = parseTaskLine(serializeTask(task));

    if (reread === null || !reread.ok || !isSameTask(reread.task, task)) {
        return 'The task does not read back as the same fields: the description or source must not end with task fields (📅, 🔁, ⏫, ✅, #tags, …) or contain " 🌱 "';
    }

    return null;
}
