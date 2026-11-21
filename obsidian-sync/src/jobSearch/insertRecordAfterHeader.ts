/**
 * Puts a record at the top of a log note: right after the first `---` line, which ends the
 * header, so the newest record comes first. The record is the heading, a blank line and the
 * text, with one blank line around it.
 */
export function insertRecordAfterHeader(content: string, heading: string, text: string): string {
    const lines = content.split('\n');
    const separatorIndex = lines.findIndex((line) => line.trim() === '---');

    if (separatorIndex === -1) {
        throw new Error('The log note has no `---` line after its header');
    }

    const rest = lines.slice(separatorIndex + 1);

    while (rest.length > 0 && rest[0]?.trim() === '') {
        rest.shift();
    }

    const record = [
        heading,
        '',
        ...text.trim().split('\n'),
    ];

    return [
        ...lines.slice(0, separatorIndex + 1),
        '',
        ...record,
        ...(rest.length > 0
            ? [
                '',
                ...rest,
            ]
            : ['']),
    ].join('\n');
}
