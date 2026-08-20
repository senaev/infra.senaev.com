import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node', // default environment
        environmentMatchGlobs: [
            [
                'src/reactHooks/**/*.test.{ts,tsx}',
                'jsdom',
            ], // jsdom for React hooks tests
        ],
        maxWorkers: '100%',
    },
});
