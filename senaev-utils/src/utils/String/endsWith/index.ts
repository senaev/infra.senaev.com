/**
 * Checks that the string has a specific ending
 */
export function endsWith(str: string, suffix: string): boolean {
    return suffix === str.substring(str.length - suffix.length);
}
