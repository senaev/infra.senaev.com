function* starts(content: string): Generator<number> {
    yield 0;
    for (let index = content.indexOf('\n'); index !== -1; index = content.indexOf('\n', index + 1)) {
        yield index + 1;
    }
}

export function createLineStarts(content: string): number[] {
    return [...starts(content)];
}

function finish(offsets: number[], length: number): number[] {
    if (offsets.at(-1) !== length) {
        offsets.push(length);
    }

    return offsets;
}

/** Starts plus the end boundary; a trailing newline terminates the last line. */
export function createLineOffsets(content: string): number[] {
    return finish(createLineStarts(content), content.length);
}

export async function createLineOffsetsAsync(content: string, checkpoint: () => Promise<void>): Promise<number[]> {
    const offsets: number[] = [];

    for (const offset of starts(content)) {
        if (offsets.length % 1024 === 0) {
            await checkpoint();
        }

        offsets.push(offset);
    }

    await checkpoint();

    return finish(offsets, content.length);
}
