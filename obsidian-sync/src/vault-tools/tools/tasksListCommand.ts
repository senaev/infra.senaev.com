import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import {
    compareTasks, isActiveDailyDate, isTaskInDailyNote,
} from 'senaev-utils/src/obsidianTasks/dailyTasks';
import { todayIsoDay } from 'senaev-utils/src/obsidianTasks/isoDay';
import type { TaskPriority, TaskStatus } from 'senaev-utils/src/obsidianTasks/taskLine';
import { TASKS_TIME_ZONE } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';

import { walkVault } from '../access/walkVault';
import { getDiaryDate, type NoteScope } from '../noteScope';
import { createTextMatcher, type TextQuery } from '../textQuery';
import { scanVaultTasks, type VaultTask } from '../tasks/scanVaultTasks';
import type { VaultToolsConfig } from '../vaultToolsConfig';

const MAX_REPORTED_ERRORS = 20;

export type DayRange = {
    from: string | undefined;
    to: string | undefined;
};

export type TasksListCommandInput = {
    scope: NoteScope;
    /** `today` or `YYYY-MM-DD`. */
    dailyNote: string | undefined;
    statuses: readonly TaskStatus[] | undefined;
    priorities: readonly TaskPriority[] | undefined;
    textQuery: TextQuery | undefined;
    due: DayRange;
    closed: DayRange;
    offset: number;
    limit: number;
};

function isInRange(day: string | null, { from, to }: DayRange): boolean {
    if (from === undefined && to === undefined) {
        return true;
    }

    return day !== null && (from === undefined || day >= from) && (to === undefined || day <= to);
}

async function findLatestDiaryDate(config: VaultToolsConfig, execution: CommandExecution): Promise<string | null> {
    const walk = await walkVault(config, config.diaryFolder, execution);
    const dates = walk.files.map((path) => getDiaryDate(config, path)).filter((date) => date !== null);

    return dates.reduce<string | null>((latest, date) => (latest === null || date > latest ? date : latest), null);
}

async function createDailyNoteFilter(config: VaultToolsConfig, dailyNote: string, execution: CommandExecution) {
    const today = todayIsoDay(TASKS_TIME_ZONE);
    const noteDate = dailyNote === 'today' ? today : dailyNote;
    const isActiveNote = isActiveDailyDate({
        noteDate,
        today,
        latestExistingDate: await findLatestDiaryDate(config, execution),
    });

    return {
        noteDate,
        isActiveNote,
        matches: (task: VaultTask) => isTaskInDailyNote(task, {
            noteDate,
            isActiveNote,
        }),
    };
}

/** Lists the tasks of the notes in scope that match every filter, sorted for a daily note. */
export async function tasksListCommand(config: VaultToolsConfig, input: TasksListCommandInput, execution: CommandExecution) {
    execution.throwIfAborted();
    const {
        scope, statuses, priorities, textQuery, due, closed, offset, limit,
    } = input;
    const scan = await scanVaultTasks(config, scope, execution);
    const dailyNote = input.dailyNote === undefined ? null : await createDailyNoteFilter(config, input.dailyNote, execution);
    const matchesText = textQuery === undefined ? null : createTextMatcher(textQuery);
    const tasks = scan.tasks.filter((task) => (statuses === undefined || statuses.includes(task.status)) && (priorities === undefined || priorities.includes(task.priority)) && (matchesText === null || matchesText(task.description)) && isInRange(task.dueDate, due) && isInRange(task.status === 'open' ? null : task.closedDate, closed) && (dailyNote === null || dailyNote.matches(task)));

    tasks.sort(compareTasks);

    const page = tasks.slice(offset, offset + limit);
    const nextOffset = offset + page.length < tasks.length ? offset + page.length : null;

    return {
        ...dailyNote !== null && {
            dailyNote: {
                date: dailyNote.noteDate,
                isActive: dailyNote.isActiveNote,
            },
        },
        total: tasks.length,
        offset,
        limit,
        nextOffset,
        scannedFiles: scan.scannedFiles,
        complete: scan.readErrors.length === 0 && scan.walkErrors.length === 0,
        parseErrors: {
            count: scan.parseErrors.length,
            items: scan.parseErrors.slice(0, MAX_REPORTED_ERRORS),
        },
        readErrors: scan.readErrors.slice(0, MAX_REPORTED_ERRORS),
        walkErrors: scan.walkErrors.slice(0, MAX_REPORTED_ERRORS),
        tasks: page,
    };
}

export type TasksListCommandResult = Awaited<ReturnType<typeof tasksListCommand>>;
