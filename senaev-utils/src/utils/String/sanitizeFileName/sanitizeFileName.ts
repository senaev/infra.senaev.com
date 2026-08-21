/**
 * Replaces every character outside `[a-zA-Z0-9._-]` with an underscore, so the
 * result is safe to use as a single path segment.
 *
 * This is shared rather than duplicated because the same character class has to
 * be applied on both sides of a file handover: a name sanitised by the sending
 * service must match the name the receiving service writes to disk.
 */
export function sanitizeFileName(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
