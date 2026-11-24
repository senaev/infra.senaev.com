import type { LoginResult, LoginSession } from './login';

// A login that waits for the user to send a code or a redirect URL.
export type PendingLogin = {
    session: LoginSession;
    // The MCP server of the login; undefined for the Claude login.
    mcpServerName?: string;
    // Tells the user the result of the code.
    report(result: LoginResult): Promise<void>;
    // Runs when the login is stopped before a code came.
    onCancel?(): void;
};

// Only one login waits for an answer at a time, Claude or MCP: the next text message is its code.
export type PendingLoginSlot = {
    // Stops the waiting login, if any, and makes this one wait.
    begin(login: PendingLogin): void;
    // Stops the waiting login; with a session, only if it is still the one that waits.
    cancel(session?: LoginSession): void;
    // The waiting login, which then no longer waits.
    take(): PendingLogin | null;
    current(): PendingLogin | null;
};

export function createPendingLoginSlot(): PendingLoginSlot {
    let pending: PendingLogin | null = null;

    function cancel(session?: LoginSession): void {
        const cancelled = pending;

        if (cancelled === null || (session !== undefined && cancelled.session !== session)) {
            return;
        }

        pending = null;
        cancelled.session.cancel();
        cancelled.onCancel?.();
    }

    return {
        begin(login) {
            cancel();
            pending = login;
        },
        cancel,
        take() {
            const taken = pending;

            pending = null;

            return taken;
        },
        current: () => pending,
    };
}
