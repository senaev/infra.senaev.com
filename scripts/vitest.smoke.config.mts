import { defineConfig } from 'vitest/config';

// Separate from the root vitest.config.mts, so that `npm test` never makes network requests.
export default defineConfig({
    test: {
        root: import.meta.dirname,
        include: ['smoke-test-websites.test.ts'],
        testTimeout: 20_000,
        reporters: ['verbose'],
    },
});
