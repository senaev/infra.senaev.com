import pluginJs from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import pluginImportX from 'eslint-plugin-import-x';
import pluginNoOnlyTests from 'eslint-plugin-no-only-tests';
import pluginReact from 'eslint-plugin-react';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const INDENT = 4;

/** @type {import('eslint').Linter.Config[]} */
export default [
    { files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'] },
    { languageOptions: { globals: globals.browser } },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    pluginReact.configs.flat.recommended,
    {
        plugins: {
            '@stylistic': stylistic,
            'import-x': pluginImportX,
            'no-only-tests': pluginNoOnlyTests,
        },
        ignores: [],

        rules: {
            'one-var': [
                'error',
                'never',
            ],
            '@stylistic/max-statements-per-line': [
                'error',
                { max: 1 },
            ],
            '@typescript-eslint/explicit-member-accessibility': [
                'error',
                {
                    accessibility: 'explicit',
                },
            ],
            'spaced-comment': [
                'error',
                'always',
                {
                    line: {
                        markers: ['/'],
                        exceptions: [
                            '-',
                            '+',
                        ],
                    },
                    block: {
                        markers: ['!'],
                        exceptions: ['*'],
                        balanced: true,
                    },
                },
            ],
            'import-x/no-unresolved': 'off',
            'import-x/named': 'off',
            'import-x/no-named-as-default': 'off',
            'import-x/order': [
                'error',
                {
                    groups: [
                        'builtin',
                        'external',
                        'parent',
                        'sibling',
                        'index',
                    ],
                    'newlines-between': 'always',
                },
            ],
            'import-x/no-empty-named-blocks': 'error',
            '@stylistic/indent': [
                'error',
                INDENT,
                {
                    ignoredNodes: [
                        'FunctionExpression > .params[decorators.length > 0]',
                        'FunctionExpression > .params > :matches(Decorator, :not(:first-child))',
                        'ClassBody.body > PropertyDefinition[decorators.length > 0] > .key',
                    ],
                },
            ],
            'no-only-tests/no-only-tests': 'error',
            '@stylistic/member-delimiter-style': [
                'error',
                {
                    multiline: {
                        delimiter: 'semi',
                        requireLast: true,
                    },
                    singleline: {
                        delimiter: 'semi',
                        requireLast: false,
                    },
                    multilineDetection: 'brackets',
                },
            ],
            'linebreak-style': [
                'error',
                'unix',
            ],
            quotes: [
                'error',
                'single',
            ],
            'no-console': ['error'],
            '@stylistic/semi': [
                'error',
                'always',
            ],
            'no-trailing-spaces': 'error',
            'no-multi-spaces': 'error',
            '@stylistic/quote-props': [
                'error',
                'as-needed',
            ],
            '@stylistic/key-spacing': [
                'error',
                {
                    beforeColon: false,
                    afterColon: true,
                },
            ],
            '@stylistic/type-annotation-spacing': [
                'error',
                {
                    before: true,
                    after: true,
                    overrides: {
                        colon: {
                            before: false,
                            after: true,
                        },
                    },
                },
            ],
            'comma-dangle': [
                'error',
                {
                    arrays: 'always-multiline',
                    objects: 'always-multiline',
                    imports: 'always-multiline',
                    exports: 'always-multiline',
                    functions: 'never',
                },
            ],
            'react/jsx-boolean-value': [
                'error',
                'always',
            ],
            'comma-spacing': [
                'error',
                {
                    before: false,
                    after: true,
                },
            ],
            'semi-spacing': [
                'error',
                {
                    before: false,
                    after: true,
                },
            ],
            'no-shadow': [
                'error',
                { allow: ['this'] },
            ],
            'object-shorthand': [
                'error',
                'always',
            ],
            'no-useless-rename': [
                'error',
                {
                    ignoreDestructuring: false,
                    ignoreImport: false,
                    ignoreExport: false,
                },
            ],
            'object-curly-spacing': [
                'error',
                'always',
            ],
            'react/react-in-jsx-scope': 'off',
            'eol-last': [
                'error',
                'always',
            ],
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    args: 'all',
                    argsIgnorePattern: '^_',
                    caughtErrors: 'all',
                    caughtErrorsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    ignoreRestSiblings: true,
                },
            ],
            '@typescript-eslint/no-empty-object-type': 'off',
            'no-unreachable': ['warn'],
            'react/jsx-indent': [
                'error',
                INDENT,
            ],
            'react/jsx-one-expression-per-line': [
                'error',
                { allow: 'literal' },
            ],
            'space-in-parens': [
                'error',
                'never',
            ],
            'no-whitespace-before-property': 'error',
            'react/jsx-tag-spacing': [
                'error',
                {
                    closingSlash: 'never',
                    beforeSelfClosing: 'never',
                    afterOpening: 'never',
                    beforeClosing: 'never',
                },
            ],
            'keyword-spacing': [
                'error',
                { after: true },
            ],
            '@typescript-eslint/member-ordering': 'error',
            curly: [
                'error',
                'all',
            ],
            'prefer-template': 'error',
            '@stylistic/template-tag-spacing': [
                'error',
                'never',
            ],
            '@stylistic/template-curly-spacing': [
                'error',
                'never',
            ],
            'react/jsx-curly-spacing': [
                'error',
                {
                    when: 'never',
                    children: true,
                },
                { allowMultiline: true },
            ],
            'react/jsx-curly-newline': [
                'error',
                {
                    singleline: 'consistent',
                    multiline: 'consistent',
                },
            ],
            'multiline-ternary': [
                'error',
                'always-multiline',
            ],
            'react/jsx-closing-bracket-location': [
                'error',
                'line-aligned',
            ],
            'comma-style': [
                'error',
                'last',
            ],
            'space-infix-ops': ['error'],
            'react/jsx-curly-brace-presence': [
                'error',
                {
                    props: 'always',
                    children: 'always',
                },
            ],
            'react/jsx-first-prop-new-line': [
                'error',
                'multiline',
            ],
            'react/jsx-max-props-per-line': [
                'error',
                {
                    maximum: 1,
                    when: 'always',
                },
            ],
            '@stylistic/func-call-spacing': [
                'error',
                'never',
            ],
            'object-curly-newline': [
                'error',
                {
                    ObjectExpression: {
                        minProperties: 3,
                        multiline: true,
                        consistent: true,
                    },
                    ObjectPattern: {
                        minProperties: 3,
                        multiline: true,
                        consistent: true,
                    },
                    ImportDeclaration: {
                        minProperties: 3,
                        multiline: true,
                        consistent: true,
                    },
                    ExportDeclaration: {
                        minProperties: 3,
                        multiline: true,
                        consistent: true,
                    },
                },
            ],
            'array-element-newline': [
                'error',
                {
                    multiline: true,
                    minItems: 2,
                },
            ],
            'function-paren-newline': [
                'error',
                'multiline',
            ],
            'array-bracket-newline': [
                'error',
                {
                    multiline: true,
                    minItems: 2,
                },
            ],
            'arrow-parens': [
                'error',
                'always',
            ],
            'arrow-body-style': [
                'error',
                'as-needed',
                { requireReturnForObjectLiteral: true },
            ],
            'brace-style': [
                'error',
                '1tbs',
                { allowSingleLine: false },
            ],
            'object-property-newline': [
                'error',
                {
                    allowAllPropertiesOnSameLine: false, // Ensure every property is on its own line
                },
            ],
            'no-multiple-empty-lines': [
                'error',
                {
                    max: 1, // Allow at most 1 consecutive blank line
                    maxEOF: 0, // No blank lines at the end of a file
                    maxBOF: 0, // No blank lines at the beginning of a file
                },
            ],
        },
    },
];
