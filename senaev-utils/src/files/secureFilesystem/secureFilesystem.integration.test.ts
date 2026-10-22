import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { expect, it } from 'vitest';

// Real descriptors, filesystem races and a Python process belong in integration coverage.
it('keeps publication bound to the real directory descriptor', () => {
    expect(() => execFileSync('python3', [join(__dirname, 'secureFilesystem.integration.py')], { stdio: 'pipe' })).not.toThrow();
});
