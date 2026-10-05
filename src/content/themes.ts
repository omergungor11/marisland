/**
 * Shim (M14b TASK-360): the department themes live in content/themes/ (one file per theme,
 * assembled in themes/index.ts). Existing imports of this module keep working.
 */
export * from './themes/index.ts';
