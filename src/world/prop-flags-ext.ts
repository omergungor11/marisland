/**
 * Phase 2 prop flag extension (TASK-211, coordinated with TASK-201): `propRemove` of a scatter
 * prop hides it with this bit instead of compacting the PropStore. Lives beside `PropFlag`
 * (prop-store.ts, bits 1–16) until the orchestrator folds it into `PropFlag.removed`.
 */
export const PROP_FLAG_REMOVED = 32;
