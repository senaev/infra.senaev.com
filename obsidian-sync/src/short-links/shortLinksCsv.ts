import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

import { logger } from '../logger';

const ID_COLUMN = 'id';
const URL_COLUMN = 'url';

export type ShortLinksTable = {
    /** Other columns, such as a comment added with obsidian-csv_query, are kept on append. */
    headers: string[];
    links: Map<string, string>;
};

/** Only web pages: a `javascript:` or `data:` target must never become a redirect. */
export function isAllowedShortLinkTarget(url: string): boolean {
    if (!URL.canParse(url)) {
        return false;
    }

    const { protocol } = new URL(url);

    return protocol === 'https:' || protocol === 'http:';
}

/** Parses `short_links.csv`. Rows with an empty id or a target that is not allowed are skipped. */
export function parseShortLinksCsv(content: string): ShortLinksTable {
    const [
        headers,
        ...rows
    ] = parse(content, {
        bom: true,
        skip_empty_lines: true,
        relax_column_count: true,
    }) as string[][];

    if (headers === undefined) {
        return {
            headers: [
                ID_COLUMN,
                URL_COLUMN,
            ],
            links: new Map(),
        };
    }

    const columns = headers.map((header) => header.trim().toLowerCase());
    const idIndex = columns.indexOf(ID_COLUMN);
    const urlIndex = columns.indexOf(URL_COLUMN);

    if (idIndex === -1 || urlIndex === -1) {
        throw new Error(`short_links.csv must have the "${ID_COLUMN}" and "${URL_COLUMN}" columns`);
    }

    const links = new Map<string, string>();

    for (const row of rows) {
        const id = row[idIndex]?.trim() ?? '';
        const url = row[urlIndex]?.trim() ?? '';

        if (id === '' || !isAllowedShortLinkTarget(url)) {
            logger.warn({ id }, '⚠️ Skipping a short_links.csv row with an empty id or a target that is not http(s)');
            continue;
        }

        links.set(id, url);
    }

    return {
        headers,
        links,
    };
}

/** The file content with one more row. Keeps the line ending of the file. */
export function appendShortLinkRow(content: string, headers: readonly string[], id: string, url: string): string {
    const row = headers.map((header) => {
        const column = header.trim().toLowerCase();

        if (column === ID_COLUMN) {
            return id;
        }

        return column === URL_COLUMN ? url : '';
    });

    if (content.trim() === '') {
        return stringify([
            [...headers],
            row,
        ]);
    }

    const recordDelimiter = content.includes('\r\n') ? '\r\n' : '\n';
    const separator = content.endsWith('\n') ? '' : recordDelimiter;

    return `${content}${separator}${stringify([row], { record_delimiter: recordDelimiter })}`;
}

/** The content of a new `short_links.csv` with these links. */
export function formatShortLinksCsv(links: ReadonlyMap<string, string>): string {
    return stringify([
        [
            ID_COLUMN,
            URL_COLUMN,
        ],
        ...links,
    ]);
}
