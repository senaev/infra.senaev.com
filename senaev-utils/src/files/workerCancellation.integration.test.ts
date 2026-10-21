import { expect, it } from 'vitest';

import { createCommandExecution, type CommandExecution } from '../commands/CommandExecution';

import { createFileDiffAsync } from './createFileDiffAsync';
import { replaceExactlyOnceAsync as replaceText } from './textEdits';

it('yields during patch scanning and terminates CPU diff workers on cancellation', async () => {
    for (const run of [
        (execution: CommandExecution) => replaceText('x\n'.repeat(100000), 'x', 'y', { execution }),
        (execution: CommandExecution) => createFileDiffAsync('large.md', 'a\nb\n'.repeat(20000), 'b\na\n'.repeat(20000), execution),
    ]) {
        const controller = new AbortController();
        const reason = new Error('CPU cancelled');
        const execution = createCommandExecution({ signal: controller.signal });
        const promise = run(execution);

        setImmediate(() => controller.abort(reason));
        await expect(promise).rejects.toBe(reason);
    }
});
