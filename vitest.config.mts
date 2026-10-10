import { defineConfig } from 'vitest/config';

// One project per package, each rooted in its own directory so that relative paths,
// tsconfig and node_modules resolve exactly as they would if the package still ran
// vitest itself. Packages keep their own dependencies; only the runner is shared.
//
// Everything runs under the node environment. The single test that needs a DOM asks for
// one with a `@vitest-environment jsdom` docblock at the top of the file.
const PACKAGES = [
    'cluster-helper',
    'code-tools',
    'media-server-helper',
    'obsidian-sync',
    'senaev-utils',
    'vpn-subscription',
];

// These packages validate their environment at import time, so their tests need values in
// place before the module graph is evaluated.
const SETUP_FILES: Record<string, string[]> = {
    'code-tools': ['./vitest.setup.ts'],
    'obsidian-sync': ['./vitest.setup.ts'],
};

export default defineConfig({
    test: {
        maxWorkers: '100%',
        projects: PACKAGES.map((name) => {
            return {
                test: {
                    name,
                    root: `./${name}`,
                    environment: 'node',
                    setupFiles: SETUP_FILES[name] ?? [],
                },
            };
        }),
    },
});
