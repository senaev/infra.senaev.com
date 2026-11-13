import { logger } from './logger';

let previousStepAt = 0;

/**
 * Logs how long each startup step took. performance.now() counts from the start of this
 * process, so the first step also includes module loading, where tsx compiles the TypeScript.
 * The time before this process (npm and the tsx CLI) is the gap between the npm
 * "> tsx src/index.ts" log line and processStartedAt.
 */
export function logStartupStep(step: string): void {
    const now = performance.now();

    logger.info({
        step,
        stepMs: Math.round(now - previousStepAt),
        sinceProcessStartMs: Math.round(now),
        processStartedAt: new Date(performance.timeOrigin).toISOString(),
    }, '⏱️ Startup step');
    previousStepAt = now;
}
