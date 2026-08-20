/**
 * Глобальный объект.
 * Соответствует `Window & typeof globalThis` начиная с ts3.6,
 * и `Window` в более ранних версия ts
 * @see https://github.com/microsoft/TypeScript/wiki/Breaking-Changes#dom-updates
 */

export type GlobalContext = typeof window;
