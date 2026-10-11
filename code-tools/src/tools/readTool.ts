import { READ_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';
import { operationCheckpoint, throwIfOperationAborted } from 'senaev-utils/src/operations/operationContext';
import { hashContent } from 'senaev-utils/src/toolServer/contentHash';
import { optionalInteger, optionalStringArray } from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments, ToolError } from 'senaev-utils/src/toolServer/ToolError';

import type { CodeToolsConfig } from './codeToolsConfig';
import {
    normalizeProjectPath,
    type Project,
    readCodeToolArguments,
    readTextFile,
    resolveExistingFile,
    resolveProject,
} from './projectAccess';

type LineRange = {
    startLine: number;
    lineCount: number;
};

/** The offset where each line starts, plus the end of the text. A trailing "\n" ends the last line. */
function lineOffsets(content: string): number[] {
    throwIfOperationAborted();
    const offsets = [0];

    for (let index = content.indexOf('\n'); index !== -1; index = content.indexOf('\n', index + 1)) {
        offsets.push(index + 1);
    }

    if (offsets.at(-1) !== content.length) {
        offsets.push(content.length);
    }

    return offsets;
}

/**
 * Whole lines from `startLine`, as many as fit into `maxChars`. Reject an unpageable
 * line instead of silently discarding its suffix when advancing to the next line.
 */
export function sliceLines(content: string, { startLine, lineCount }: LineRange, maxChars: number, offsets = lineOffsets(content)) {
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
        throw new ToolError('command_failed', `Line ${startLine} exceeds the ${maxChars}-character page; use code-run with head, tail or sed to inspect it`);
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

async function readOneFile(project: Project, path: string, range: LineRange, maxChars: number) {
    const raw = await readTextFile(await resolveExistingFile(project, path), path);

    const offsets = [0];
    let count = 0;

    for (let index = raw.indexOf('\n'); index !== -1; index = raw.indexOf('\n', index + 1)) {
        if (count++ % 1024 === 0) {
            await operationCheckpoint();
        }

        offsets.push(index + 1);
    }

    if (offsets.at(-1) !== raw.length) {
        offsets.push(raw.length);
    }

    await operationCheckpoint();

    return {
        path,
        // Always the hash of the whole file, also for a part of it.
        hash: hashContent(raw),
        ...sliceLines(raw, range, maxChars, offsets),
    };
}

export async function readTool(config: CodeToolsConfig, input: unknown) {
    const args = readCodeToolArguments(input, 'read');
    const project = await resolveProject(config, args);
    const paths = optionalStringArray(args, 'paths', { maxItems: READ_LIMITS.maxPaths });

    if (paths === undefined) {
        throw invalidArguments('"paths" is required');
    }

    const startLine = optionalInteger(args, 'startLine', {
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
    });
    const lineCount = optionalInteger(args, 'lineCount', {
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
    });

    if ((startLine !== undefined || lineCount !== undefined) && paths.length > 1) {
        throw invalidArguments('"startLine" and "lineCount" work only with exactly one path');
    }

    const range = {
        startLine: startLine ?? 1,
        lineCount: lineCount ?? Number.MAX_SAFE_INTEGER,
    };
    const files: Awaited<ReturnType<typeof readOneFile>>[] = [];
    const errors: { path: string; code: string; message: string }[] = [];
    let budget: number = READ_LIMITS.maxCharsPerResponse;
    let remainingPaths: string[] = [];

    for (const [
        index,
        requestedPath,
    ] of paths.entries()) {
        await operationCheckpoint();
        const isFirstRead = files.length === 0;
        const maxChars = READ_LIMITS.maxCharsPerFile;

        try {
            const file = await readOneFile(project, normalizeProjectPath(requestedPath, 'paths'), range, maxChars);

            // Defer a file that only exceeds the remaining aggregate response budget;
            // its own page is still valid and must not be mistaken for an overlong line.
            if (!isFirstRead && file.content.length > budget) {
                remainingPaths = paths.slice(index);
                break;
            }

            files.push(file);
            budget -= file.content.length;
        } catch (error) {
            throwIfOperationAborted();
            if (!(error instanceof ToolError) || paths.length === 1) {
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
