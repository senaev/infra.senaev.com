import { WRITE_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';
import {
    assertExpectedHash, hashContent, readExpectedHash,
} from 'senaev-utils/src/toolServer/contentHash';
import { createFileDiff } from 'senaev-utils/src/toolServer/createFileDiff';
import { prepareNewFilePath } from 'senaev-utils/src/toolServer/rootRelativePath';
import { requiredNonEmptyString, requiredString } from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments, ToolError } from 'senaev-utils/src/toolServer/ToolError';
import { createFileExclusively, replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';
import { isAlreadyExistsError } from 'senaev-utils/src/utils/Error/isAlreadyExistsError/isAlreadyExistsError';

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
        await createFileExclusively(await prepareNewFilePath(project.root, path), content);
    } catch (error) {
        if (isAlreadyExistsError(error)) {
            throw new ToolError('already_exists', `"${path}" already exists; read it with code-read and pass its "hash" as "expectedHash" to replace it`);
        }

        throw error;
    }
}

/** Replaces the whole file, but only the version the caller read. */
async function replaceFile(project: Project, path: string, content: string, expectedHash: string): Promise<string> {
    const absolutePath = await resolveExistingFile(project, path);
    const original = await readTextFile(absolutePath, path);

    assertExpectedHash(original, expectedHash, 'file');

    if (content !== original) {
        await replaceFileAtomically(absolutePath, content);
    }

    return original;
}

export async function writeTool(config: CodeToolsConfig, input: unknown) {
    const args = readCodeToolArguments(input, 'write');
    const project = await resolveProject(config, args);
    const path = normalizeProjectPath(requiredNonEmptyString(args, 'path'), 'path');
    const content = requiredString(args, 'content', WRITE_LIMITS.maxContentChars);

    if (path === '') {
        throw invalidArguments('"path" must name a file, not the project root');
    }

    const isReplace = args.expectedHash !== undefined && args.expectedHash !== null;
    let original = '';

    if (isReplace) {
        original = await replaceFile(project, path, content, readExpectedHash(args, 'expectedHash', 'code-read'));
    } else {
        await createFile(project, path, content);
    }

    return {
        path,
        created: !isReplace,
        changed: content !== original || !isReplace,
        hash: hashContent(content),
        ...createFileDiff(path, original, content),
    };
}
