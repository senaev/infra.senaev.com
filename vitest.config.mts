import { configDefaults, defineConfig } from 'vitest/config';

// Projects are rooted in each package directory so that relative paths,
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

// Only these audited, deterministic utility tests share workers. Keep module mocks,
// environment mutations, DOM, filesystem and process tests isolated. New directories
// stay isolated until reviewed; do not turn isolation off for an entire service.
const REUSABLE_UTIL_TESTS = [
    'src/types/**/*.{test,spec}.ts',
    ...[
        'Array',
        'CircularBuffer',
        'Date',
        'Deque',
        'Error',
        'Function',
        'Latch',
        'Map',
        'Math',
        'MinHeap',
        'MinHeapUniqueNumber',
        'MinMaxHeap',
        'Number',
        'Object',
        'Pagination',
        'Ranges',
        'Signal',
        'String',
        'binarySearch',
        'binarySearchClosest',
        'getPrimeNumbersWithEratosthenesSieve',
        'random',
    ].map((folder) => `src/utils/${folder}/**/*.{test,spec}.ts`),
];

export default defineConfig({
    test: {
        maxWorkers: '100%',
        projects: PACKAGES.flatMap((name) => {
            const isolated = {
                test: {
                    name: `${name}-unit`,
                    slowTestThreshold: 100,
                    root: `./${name}`,
                    environment: 'node',
                    exclude: [
                        ...configDefaults.exclude,
                        '**/*.integration.test.ts',
                    ],
                    ...name === 'senaev-utils'
                        ? {
                            exclude: [
                                ...configDefaults.exclude,
                                '**/*.integration.test.ts',
                                ...REUSABLE_UTIL_TESTS,
                            ],
                        }
                        : {},
                    // Native subprocess/worker startup and 5-second observation need
                    // a runner budget distinct from the backend's operation deadline.
                    ...[
                        'code-tools',
                        'obsidian-sync',
                    ].includes(name)
                        ? { testTimeout: 15000 }
                        : {},
                    setupFiles: SETUP_FILES[name] ?? [],
                },
            };

            const integration = {
                test: {
                    name: `${name}-integration`,
                    root: `./${name}`,
                    environment: 'node',
                    include: ['**/*.integration.test.ts'],
                    testTimeout: 15000,
                    setupFiles: [
                        ...SETUP_FILES[name] ?? [],
                        ...[
                            'code-tools',
                            'obsidian-sync',
                        ].includes(name)
                            ? ['../senaev-utils/src/files/testing/mockFileDiff.ts']
                            : [],
                    ],
                },
            };

            return name === 'senaev-utils'
                ? [
                    isolated,
                    integration,
                    {
                        test: {
                            name: 'senaev-utils-pure',
                            slowTestThreshold: 100,
                            root: './senaev-utils',
                            environment: 'node',
                            pool: 'threads',
                            isolate: false,
                            include: REUSABLE_UTIL_TESTS,
                            exclude: [
                                ...configDefaults.exclude,
                                '**/*.integration.test.ts',
                            ],
                        },
                    },
                ]
                : [
                    isolated,
                    integration,
                ];
        }),
    },
});
