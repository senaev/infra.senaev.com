/**
 * Same behaviour as `renderMilestoneTemplate` in the senaev-personal-tools plugin:
 * `{{FILENAME}}`, `{{AGE}}` (`(N)` or empty) and `{{EMOJI}}` are filled, then whitespace
 * runs are collapsed and the result is trimmed.
 */
export function renderMilestoneTemplate({
    template,
    fileName,
    age,
    emoji,
}: {
    template: string;
    fileName: string;
    age: number | undefined;
    emoji: string;
}): string {
    // Replacements are functions so that `$&` and friends inside a note name
    // are inserted literally instead of being read as substitution patterns.
    return template
        .replaceAll('{{FILENAME}}', () => fileName)
        .replaceAll('{{AGE}}', () => (age === undefined ? '' : `(${age})`))
        .replaceAll('{{EMOJI}}', () => emoji)
        .replace(/\s+/g, ' ')
        .trim();
}
