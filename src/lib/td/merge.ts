/**
 * Three-way merge of a conflicting edit. PATCH sends the whole document, so
 * saving "mine" over a newer row would silently undo the other person's
 * changes. Field by field (top-level data fields, the position and the note;
 * lists are taken whole): a field only they changed takes theirs, one only I
 * changed keeps mine, and one we both changed differently is a conflict the
 * editor resolves.
 */
type Data = Record<string, unknown>;

export interface TdDraft {
  data: Data;
  position: number;
  note: string;
}

export interface TdFieldConflict {
  field: string;
  base: unknown;
  mine: unknown;
  theirs: unknown;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted((value as Data)[key])]));
  return value;
}

export const sameDraft = (a: TdDraft, b: TdDraft) => same(a, b);

export function mergeDrafts(base: TdDraft, mine: TdDraft, theirs: TdDraft): { merged: TdDraft; conflicts: TdFieldConflict[] } {
  const conflicts: TdFieldConflict[] = [];
  const pick = (field: string, b: unknown, m: unknown, t: unknown) => {
    if (same(m, b)) return t;
    if (same(t, b) || same(m, t)) return m;
    conflicts.push({ field, base: b, mine: m, theirs: t });
    return m;
  };
  const fields = new Set([...Object.keys(base.data), ...Object.keys(mine.data), ...Object.keys(theirs.data)]);
  const data: Data = {};
  for (const field of fields) {
    const value = pick(`data.${field}`, base.data[field], mine.data[field], theirs.data[field]);
    if (value !== undefined) data[field] = value;
  }
  return {
    merged: {
      data,
      position: pick('position', base.position, mine.position, theirs.position) as number,
      note: pick('note', base.note, mine.note, theirs.note) as string,
    },
    conflicts,
  };
}

/** The merged draft with each conflict settled: 'mine' or 'theirs' per field. */
export function resolveConflicts(merged: TdDraft, conflicts: TdFieldConflict[], choices: Record<string, 'mine' | 'theirs'>): TdDraft {
  const out: TdDraft = { data: { ...merged.data }, position: merged.position, note: merged.note };
  for (const conflict of conflicts) {
    const value = choices[conflict.field] === 'theirs' ? conflict.theirs : conflict.mine;
    if (conflict.field === 'position') out.position = value as number;
    else if (conflict.field === 'note') out.note = value as string;
    else out.data[conflict.field.slice('data.'.length)] = value;
  }
  return out;
}
