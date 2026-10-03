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
