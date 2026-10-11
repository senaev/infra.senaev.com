import { WRITE_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';
import {
    assertExpectedHash, hashContent, readExpectedHash,
} from 'senaev-utils/src/toolServer/contentHash';
import {
    operationCheckpoint, operationContext, recordChangedPath, throwIfOperationAborted,
} from 'senaev-utils/src/operations/operationContext';
import { prepareNewFilePath } from 'senaev-utils/src/toolServer/rootRelativePath';
import { requiredNonEmptyString, requiredString } from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments, ToolError } from 'senaev-utils/src/toolServer/ToolError';
import { createFileExclusively, replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';
import { isAlreadyExistsError } from 'senaev-utils/src/utils/Error/isAlreadyExistsError/isAlreadyExistsError';
import { createFileDiffAsync } from 'senaev-utils/src/toolServer/createFileDiffAsync';
import { withFileMutation } from 'senaev-utils/src/toolServer/withFileMutation';

import type { CodeToolsConfig } from './codeToolsConfig';
import {
    normalizeProjectPath,
    type Project,
    readCodeToolArguments,
    readTextFile,
    resolveExistingFile,
    resolveProject,
} from './projectAccess';

async function createFile(project: Project, path: string, content: string): Promise<void> {
    try {
        await createFileExclusively(await prepareNewFilePath(project.root, path), content, operationContext()?.signal, () => recordChangedPath(path));
    } catch (error) {
        if (isAlreadyExistsError(error)) {
            throw new ToolError('already_exists', `"${path}" already exists; read it with code-read and pass its "hash" as "expectedHash" to replace it`);
        }

        throw error;
    }
}

/** Replaces the whole file, but only the version the caller read. */
async function replaceFile(project: Project, path: string, content: string, expectedHash: string) {
    const absolutePath = await resolveExistingFile(project, path);
    const original = await readTextFile(absolutePath, path);

    assertExpectedHash(original, expectedHash, 'file');

    const diff = await createFileDiffAsync(path, original, content);

    if (content !== original) {
        assertExpectedHash(await readTextFile(absolutePath, path), expectedHash, 'file');
        await replaceFileAtomically(absolutePath, content, operationContext()?.signal, () => recordChangedPath(path));
    }

    return {
        original,
        diff,
    };
}

export async function writeTool(config: CodeToolsConfig, input: unknown) {
    const args = readCodeToolArguments(input, 'write');
    const project = await resolveProject(config, args);
    const path = normalizeProjectPath(requiredNonEmptyString(args, 'path'), 'path');
    const content = requiredString(args, 'content', WRITE_LIMITS.maxContentChars);

    if (path === '') {
        throw invalidArguments('"path" must name a file, not the project root');
    }

    throwIfOperationAborted();

    return withFileMutation(`${project.root}/${path}`, async () => {
        const isReplace = args.expectedHash !== undefined && args.expectedHash !== null;
        let original = '';
        let diff;

        if (isReplace) {
            ({ original, diff } = await replaceFile(project, path, content, readExpectedHash(args, 'expectedHash', 'code-read')));
        } else {
            diff = await createFileDiffAsync(path, original, content);
            await createFile(project, path, content);
        }

        await operationCheckpoint();

        return {
            path,
            created: !isReplace,
            changed: content !== original || !isReplace,
            hash: hashContent(content),
            ...diff,
        };
    });
}
