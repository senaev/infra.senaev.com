/**
 * Formats a task as an Obsidian Tasks plugin-compatible checkbox line.
 *
 * Examples:
 *   - [ ] Buy groceries
 *   - [ ] Submit report 📅 2026-07-15
 */
export function formatTaskLine(title: string, dueDate: string | null): string {
    const due = dueDate ? ` 📅 ${dueDate}` : '';

    return `- [ ] ${title}${due}`;
}
