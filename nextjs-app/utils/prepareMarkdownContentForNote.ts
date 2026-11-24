import { ensureEmptyLineAfterTables } from './Notes/ensureEmptyLineAfterTables/ensureEmptyLineAfterTables';

function replaceWikiLinksInTextWithRelativeLinks(text: string) {
    const regex = /\[\[([^\]]*)\]\]/gm;

    return text.replace(regex, (match) => {
        const withSquarePqrenthesisRemoved = match.substring(2, match.length - 2);

        const parts = withSquarePqrenthesisRemoved.split('|');

        let title = withSquarePqrenthesisRemoved;
        let link = withSquarePqrenthesisRemoved;

        if (parts.length > 1) {
            link = parts.shift()!;
            title = parts.join('|');
        }

        return `[${title}](./${encodeURIComponent(link)})`;
    });
}

export function prepareMarkdownContentForNote(rawMarkdown: string): string {
    let processed = replaceWikiLinksInTextWithRelativeLinks(rawMarkdown);

    processed = ensureEmptyLineAfterTables(processed);

    return processed;
}
