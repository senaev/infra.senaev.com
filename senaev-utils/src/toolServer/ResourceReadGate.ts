import type { ServerResponse } from 'node:http';

/** Bound large buffered transfers until both file work and the HTTP response have finished. */
export class ResourceReadGate {
    private active = false;

    public begin(response: ServerResponse, timeoutMs: number): { signal: AbortSignal; finish: () => void } | null {
        if (this.active) {
            return null;
        }

        this.active = true;
        const controller = new AbortController();
        let workFinished = false;
        let responseFinished = false;
        let released = false;
        const release = () => {
            if (released || !workFinished || !responseFinished) {
                return;
            }

            released = true;
            this.active = false;
            clearTimeout(timer);
            response.off('finish', onFinish);
            response.off('close', onClose);
        };
        const onFinish = () => {
            responseFinished = true;
            release();
        };
        const onClose = () => {
            controller.abort();
            responseFinished = true;
            release();
        };
        const timer = setTimeout(() => {
            controller.abort();
            response.destroy();
        }, timeoutMs);

        timer.unref();
        response.once('finish', onFinish);
        response.once('close', onClose);

        return {
            signal: controller.signal,
            finish: () => {
                workFinished = true;
                release();
            },
        };
    }
}
