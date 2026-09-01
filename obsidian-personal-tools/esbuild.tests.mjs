import esbuild from 'esbuild';
import { readdirSync, rmSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';

/**
 * Bundles every `*.test.ts` under `src/` into `tests-dist/`, so Node's built-in
 * test runner can execute them.
 *
 * The tests import TypeScript sources with extensionless specifiers, which Node
 * cannot resolve on its own, and one of them imports `milestone-types.json`.
 * Bundling with the esbuild that already builds the plugin solves both without
 * adding a test-time TypeScript loader as a dependency.
 *
 * Type errors are not caught here — `tsc -noEmit` covers the tests too, since
 * they live under `src/`.
 */

const TEST_SUFFIX = '.test.ts';
const SOURCE_DIR = 'src';
const OUTPUT_DIR = 'tests-dist';

const entryPoints = readdirSync(SOURCE_DIR, { recursive: true })
	.filter((file) => String(file).endsWith(TEST_SUFFIX))
	.map((file) => join(SOURCE_DIR, String(file)));

if (entryPoints.length === 0) {
	throw new Error(`No ${TEST_SUFFIX} files found under ${SOURCE_DIR}/.`);
}

// Cleared first: a renamed or deleted test would otherwise keep running from
// its previous bundle and report failures for source that no longer exists.
rmSync(OUTPUT_DIR, { recursive: true, force: true });

await esbuild.build({
	entryPoints,
	bundle: true,
	outdir: OUTPUT_DIR,
	platform: 'node',
	format: 'esm',
	target: 'es2021',
	// Inline, so a failing assertion points at the TypeScript line.
	sourcemap: 'inline',
	logLevel: 'warning',
	// `obsidian` ships types only, so anything that imports it at runtime — as
	// opposed to for types alone — must stay out of the tested modules.
	external: ['obsidian', '@codemirror/state', '@codemirror/view', ...builtinModules],
});
