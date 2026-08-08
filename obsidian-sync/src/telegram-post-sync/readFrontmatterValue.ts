/**
 * Reads a single-line scalar value out of a raw frontmatter block.
 *
 * Deliberately not a YAML parser — the container has no YAML dependency and this only
 * ever needs to read one flat `key: value` line. Anything more structured (nested maps,
 * block scalars, multi-line lists) returns null rather than guessing.
 */
export function readFrontmatterValue(frontmatter: string, key: string): string | null {
    for (const rawLine of frontmatter.split("\n")) {
        const line = rawLine.trim();
        if (!line.startsWith(`${key}:`)) {
            continue;
        }

        const value = line.slice(key.length + 1).trim();
        if (!value) {
            return null;
        }

        return value.replace(/^["']|["']$/g, "");
    }

    return null;
}
