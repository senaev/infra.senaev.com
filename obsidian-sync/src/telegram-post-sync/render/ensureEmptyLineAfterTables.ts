const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|[\s\-:|]+\|\s*$/;

/**
 * Ensures there's an empty line after markdown tables.
 *
 * Obsidian doesn't add one, and GFM parsers interpret text immediately following a table
 * as part of the table. Telegram's rich markdown is documented as GFM-compatible, so it
 * very likely shares the behaviour.
 *
 * Ported from senaev.com's `utils/Notes/ensureEmptyLineAfterTables`.
 */
export function ensureEmptyLineAfterTables(text: string): string {
    const result: string[] = [];
    let inTable = false;

    for (const line of text.split("\n")) {
        if (TABLE_ROW.test(line) || TABLE_SEPARATOR.test(line)) {
            inTable = true;
            result.push(line);
            continue;
        }

        if (inTable && line.trim() !== "") {
            const lastLine = result[result.length - 1];
            if (lastLine !== undefined && lastLine.trim() !== "") {
                result.push("");
            }
        }

        inTable = false;
        result.push(line);
    }

    return result.join("\n");
}
