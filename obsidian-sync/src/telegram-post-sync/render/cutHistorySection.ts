// Notes accumulate dated history sections like "## [[2025-11-07]]". Everything from the
// first such heading onwards is historical and must not reach the channel.
const HISTORY_HEADING = /\n##[ \t]*\[\[\d{4}-\d{2}-\d{2}\]\][ \t]*(?=\n|$)/;

/** Truncates the note at the first dated history heading, dropping the heading too. */
export function cutHistorySection(body: string): string {
    const match = HISTORY_HEADING.exec(body);

    if (!match) {
        return body;
    }

    return body.slice(0, match.index);
}
