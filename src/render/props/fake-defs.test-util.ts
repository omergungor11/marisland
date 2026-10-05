import { PROP_DEFS, PROP_DEF_INDEX, type PropDef } from '../../content/props.ts';

/**
 * Tests only: append fake PropDefs to the live tables (over existing geometry ids) so render
 * code can be exercised before the real defs land. Returns the undo.
 */
export function withFakeDefs(defs: readonly PropDef[]): () => void {
  const table = PROP_DEFS as PropDef[];
  const start = table.length;
  for (const def of defs) {
    PROP_DEF_INDEX[def.id] = table.length;
    table.push(def);
  }
  return () => {
    table.splice(start, defs.length);
    for (const def of defs) delete PROP_DEF_INDEX[def.id];
  };
}
