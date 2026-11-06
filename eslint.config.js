// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const nonDeterministic = [
  {
    object: 'Math',
    property: 'random',
    message: 'Use rng.fork(label) — determinism (CLAUDE.md rule 2).',
  },
  {
    object: 'Date',
    property: 'now',
    message: 'Use the engine clock — determinism (CLAUDE.md rule 2).',
  },
  {
    object: 'performance',
    property: 'now',
    message: 'Use the engine clock — determinism (CLAUDE.md rule 2).',
  },
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-*/**',
      '.claude/worktrees/**',
      'node_modules/**',
      'shots/**',
      'coverage/**',
      'public/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.es2022 },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    // Determinism: sim/gen/anim code must never read wall-clock or Math.random.
    files: [
      'src/world/**',
      'src/life/**',
      'src/anim/**',
      'src/shared/**',
      'src/core/rng*.ts',
      'src/core/noise*.ts',
      'src/geo/**',
      'src/env/**',
    ],
    rules: {
      'no-restricted-properties': ['error', ...nonDeterministic],
    },
  },
  {
    // Cross-platform bits (TASK-552, D-132): V8's transcendentals round differently on arm64 and
    // x64 (1 ulp is enough to flip a sort tie and move a prop). Generation uses core/math/dmath.
    files: [
      'src/world/**',
      'src/content/**',
      'src/shared/**',
      'src/core/noise*.ts',
      'src/core/rng*.ts',
      'src/core/math/poisson.ts',
    ],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...nonDeterministic,
        ...['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh']
          .concat(['asinh', 'acosh', 'atanh', 'exp', 'expm1', 'log', 'log1p', 'log2', 'log10'])
          .concat(['pow', 'cbrt'])
          .map((property) => ({
            object: 'Math',
            property,
            message: `Math.${property} differs between arm64 and x64: use src/core/math/dmath.ts (dm.sin, dm.pow, ...; add a port there if missing), D-132.`,
          })),
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "BinaryExpression[operator='**']:not([right.value=2])",
          message: '`**` other than `** 2` differs between arm64 and x64: use dm.pow (D-132).',
        },
        {
          selector: "AssignmentExpression[operator='**=']",
          message: '`**=` differs between arm64 and x64: use dm.pow (D-132).',
        },
      ],
    },
  },
  {
    // world/ is pure data: no three.js, no DOM.
    files: ['src/world/**', 'src/content/**', 'src/shared/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'three', message: 'src/world and src/content must stay three-free (D-005).' },
          ],
          patterns: ['three/*'],
        },
      ],
    },
  },
);
