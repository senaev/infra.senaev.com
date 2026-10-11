import { operationCheckpoint } from 'senaev-utils/src/operations/operationContext';
import { ToolError } from 'senaev-utils/src/toolServer/ToolError';

/** Cooperative equivalent of replaceExactlyOnce, including ambiguity line numbers. */
export async function replaceText(content: string, find: string, replacement: string): Promise<string> {
    const offsets: number[] = [];

    for (let offset = content.indexOf(find); offset !== -1; offset = content.indexOf(find, offset + find.length)) {
        if (offsets.length % 1024 === 0) {
            await operationCheckpoint();
        }

        offsets.push(offset);
    }

    await operationCheckpoint();
    if (offsets.length === 0) {
        throw new ToolError('not_found', 'The "find" text does not occur in the file; read the file again and copy the text exactly');
    }

    if (offsets.length > 1) {
        const lines: number[] = [];
        let cursor = 0;
        let line = 1;

        for (const offset of offsets) {
            if (lines.length % 1024 === 0) {
                await operationCheckpoint();
            }

            for (let newline = content.indexOf('\n', cursor); newline !== -1 && newline < offset; newline = content.indexOf('\n', cursor)) {
                line++;
                if (line % 1024 === 0) {
                    await operationCheckpoint();
                }

                cursor = newline + 1;
            }

            lines.push(line);
        }

        throw new ToolError('ambiguous', `The "find" text occurs ${offsets.length} times; include more surrounding text so it occurs once`, { lines });
    }

    const offset = offsets[0] ?? 0;

    return `${content.slice(0, offset)}${replacement}${content.slice(offset + find.length)}`;
}
