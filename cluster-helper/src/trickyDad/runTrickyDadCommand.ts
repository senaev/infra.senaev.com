import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';

import { logger } from '../logger';

import type { PlannedTrickyDadAction } from './actions/TrickyDadAction';
import { planTrickyDadCommand, type TrickyDadCommandPlan } from './planTrickyDadCommand';
import type { TrickyDadSource } from './TrickyDadSource';

export type TrickyDadActionResult = {
    action: PlannedTrickyDadAction;
    /** Extra report lines from the action, for example the items that a read action found. */
    output: string[];
    durationMs: number;
    error: string | null;
};

export type TrickyDadCommandResult = Omit<TrickyDadCommandPlan, 'actions'> & {
    llmDurationMs: number;
    actionResults: TrickyDadActionResult[];
};

/**
 * Runs one action. The error must not escape: a failed action is still reported to the user,
 * exactly like a successful one, and the other actions still run.
 */
async function runAction(
    action: PlannedTrickyDadAction,
    command: string,
    source: TrickyDadSource
): Promise<TrickyDadActionResult> {
    const startTime = Date.now();

    logger.info({
        type: action.type,
        entries: action.entries,
    }, '👉 Running tricky dad action');

    try {
        const output = await action.run({
            command,
            source,
        });

        logger.info({ type: action.type }, '✅ Finished tricky dad action');

        return {
            action,
            output,
            durationMs: Date.now() - startTime,
            error: null,
        };
    } catch (err) {
        logger.error({
            err,
            type: action.type,
        }, '❌ Tricky dad action failed');

        return {
            action,
            output: [],
            durationMs: Date.now() - startTime,
            error: `❌ Failed to run ${action.type}: ${stringifyUnknownError(err)}`,
        };
    }
}

export async function runTrickyDadCommand(
    command: string,
    source: TrickyDadSource
): Promise<TrickyDadCommandResult> {
    logger.info({
        command,
        source,
    }, '👉 Start processing tricky dad command');

    const llmStartTime = Date.now();
    const { actions, ...plan } = await planTrickyDadCommand(command, source);
    const llmDurationMs = Date.now() - llmStartTime;

    if (plan.isFallback) {
        logger.error({
            command,
            error: plan.error,
        }, '❌ Cannot plan tricky dad command, falling back');
    }

    const actionResults = await Promise.all(actions.map((action) => runAction(action, command, source)));

    return {
        ...plan,
        llmDurationMs,
        actionResults,
    };
}
