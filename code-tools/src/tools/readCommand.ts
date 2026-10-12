import { createLineOffsets, createLineOffsetsAsync } from 'senaev-utils/src/files/textLines';
import { READ_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';
import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { hashContent } from 'senaev-utils/src/files/contentHash';
import { invalidArguments, CommandError } from 'senaev-utils/src/commands/CommandError';

import type { CodeToolsConfig } from './codeToolsConfig';
import {
    normalizeProjectPath, type Project, readTextFile, resolveExistingFile, resolveNamedProject,
} from './projectAccess';

type LineRange = {
    startLine: number;
    lineCount: number;
};

/**
 * Whole lines from `startLine`, as many as fit into `maxChars`. Reject an unpageable
 * line instead of silently discarding its suffix when advancing to the next line.
 */
export function sliceLines(content: string, { startLine, lineCount }: LineRange, maxChars: number, offsets = createLineOffsets(content)) {
    const totalLines = offsets.length - 1;

    if (totalLines > 0 && startLine > totalLines) {
        throw invalidArguments(`"startLine" is ${startLine}, but the file has only ${totalLines} lines`);
    }

    const start = offsets[startLine - 1] ?? content.length;
    const lastRequestedLine = Math.min(totalLines, startLine - 1 + lineCount);
    let endLine = startLine - 1;

    while (endLine < lastRequestedLine && (offsets[endLine + 1] ?? 0) - start <= maxChars) {
        endLine += 1;
    }

    if (endLine < startLine && lastRequestedLine >= startLine) {
        throw new CommandError('command_failed', `Line ${startLine} exceeds the ${maxChars}-character page; use head, tail or sed to inspect it`);
    }

    const text = content.slice(start, offsets[endLine] ?? start);

    return {
        totalLines,
        startLine,
        endLine,
        content: text,
        truncated: endLine < lastRequestedLine,
        ...endLine < totalLines && { nextStartLine: endLine + 1 },
    };
}

async function readOneFile(project: Project, request: { path: string; range: LineRange; maxChars: number }, execution: CommandExecution) {
    const {
        path, range, maxChars,
    } = request;
    const raw = await readTextFile(await resolveExistingFile(project, path, execution), path, execution);

    const offsets = await createLineOffsetsAsync(raw, execution.checkpoint);

    return {
        path,
        // Always the hash of the whole file, also for a part of it.
        hash: hashContent(raw),
        ...sliceLines(raw, range, maxChars, offsets),
    };
}

export type ReadCommandInput = { project: string; paths: readonly string[]; startLine: number; lineCount: number };

export async function readCommand(config: CodeToolsConfig, input: ReadCommandInput, execution: CommandExecution) {
    const project = await resolveNamedProject(config, input.project, execution);
    const {
        paths, startLine, lineCount,
    } = input;
    const range = {
        startLine,
        lineCount,
    };
    const files: Awaited<ReturnType<typeof readOneFile>>[] = [];
    const errors: { path: string; code: string; message: string }[] = [];
    let budget: number = READ_LIMITS.maxCharsPerResponse;
    let remainingPaths: string[] = [];

    for (const [
        index,
        requestedPath,
    ] of paths.entries()) {
        await execution.checkpoint();
        const isFirstRead = files.length === 0;
        const maxChars = READ_LIMITS.maxCharsPerFile;

        try {
            const file = await readOneFile(project, {
                path: normalizeProjectPath(requestedPath, 'paths'),
                range,
                maxChars,
            }, execution);

            // Defer a file that only exceeds the remaining aggregate response budget;
            // its own page is still valid and must not be mistaken for an overlong line.
            if (!isFirstRead && file.content.length > budget) {
                remainingPaths = paths.slice(index);
                break;
            }

            files.push(file);
            budget -= file.content.length;
        } catch (error) {
            execution.throwIfAborted();
            if (!(error instanceof CommandError) || paths.length === 1) {
                throw error;
            }

            errors.push({
                path: requestedPath,
                code: error.code,
                message: error.message,
            });
        }

        if (budget <= 0) {
            remainingPaths = paths.slice(index + 1);
            break;
        }
    }

    return {
        project: project.name,
        files,
        remainingPaths,
        errors,
    };
}

export type ReadCommandResult = Awaited<ReturnType<typeof readCommand>>;
