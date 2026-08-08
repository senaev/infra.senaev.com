/**
 * Reads a list value out of a raw frontmatter block, supporting both YAML shapes
 * Obsidian writes:
 *
 *   aliases: []
 *   aliases: [Сырники, Syrniki]
 *   aliases:
 *     - Сырники
 *     - Syrniki
 *
 * Deliberately not a YAML parser — see readFrontmatterValue. Returns an empty array when
 * the key is absent or empty, so callers never need a null check.
 */
export function readFrontmatterList(frontmatter: string, key: string): string[] {
    const lines = frontmatter.split("\n");
    const keyIndex = lines.findIndex((line) => line.trim().startsWith(`${key}:`));
    if (keyIndex === -1) {
        return [];
    }

    const keyLine = lines[keyIndex];
    if (keyLine === undefined) {
        return [];
    }

    const inlineValue = keyLine.trim().slice(key.length + 1).trim();

    if (inlineValue.startsWith("[")) {
        return inlineValue
            .replace(/^\[|\]$/g, "")
            .split(",")
            .map(normalizeItem)
            .filter((item) => item !== "");
    }

    // A non-empty scalar on the key line means it isn't a list at all.
    if (inlineValue !== "") {
        const single = normalizeItem(inlineValue);
        return single === "" ? [] : [single];
    }

    const items: string[] = [];
    for (const line of lines.slice(keyIndex + 1)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("- ") && trimmed !== "-") {
            // Any other content ends the block — either the next key or a blank line.
            break;
        }

        const item = normalizeItem(trimmed.slice(1));
        if (item !== "") {
            items.push(item);
        }
    }

    return items;
}

function normalizeItem(raw: string): string {
    return raw.trim().replace(/^["']|["']$/g, "").trim();
}
