/**
 * The global object.
 * Matches `Window & typeof globalThis` starting from ts3.6,
 * and `Window` in earlier ts versions
 * @see https://github.com/microsoft/TypeScript/wiki/Breaking-Changes#dom-updates
 */

export type GlobalContext = typeof window;
