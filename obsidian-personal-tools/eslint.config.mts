import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores } from 'eslint/config';

export default tseslint.config(
	globalIgnores([
		'node_modules',
		'dist',
		'tests-dist',
		'esbuild.config.mjs',
		'esbuild.tests.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts'],
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		rules: {
			'obsidianmd/ui/sentence-case': ['error', {
				brands: ['Google', 'Google Translate'],
			}],
		},
	},
	{
		files: ['src/**/*.test.ts'],
		languageOptions: { globals: globals.node },
		// Tests run in Node; the shipped plugin must remain browser-compatible.
		rules: { 'import/no-nodejs-modules': 'off' },
	},
);
