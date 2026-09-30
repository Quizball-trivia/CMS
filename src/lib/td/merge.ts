/**
 * Three-way merge of a conflicting edit. PATCH sends the whole document, so
 * saving "mine" over a newer row would silently undo the other person's
 * changes. Unit by unit (a data field, or a group of fields that only make
 * sense together, such as a question's options and its right answer; lists
 * are taken whole; the position; the note): a unit only they changed takes
 * theirs, one only I changed keeps mine, and one we both changed differently
 * is a conflict the editor resolves as a whole.
 */
type Data = Record<string, unknown>;

export interface TdDraft {
  data: Data;
  position: number;
  note: string;
}

export interface TdFieldConflict {
  /** `data.<field>`, `position`, `note`, or a unit's fields joined by `+` (`data.options+answer`). */
  field: string;
  /** For a unit: an object of its fields. */
  base: unknown;
  mine: unknown;
  theirs: unknown;
  /** The data fields a unit's conflict covers. */
  unit?: string[];
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

/**
 * `units`: groups of data fields merged as one (content-rules.ts
 * TD_MERGE_UNITS); a field in no group is its own unit.
 */
export function mergeDrafts(base: TdDraft, mine: TdDraft, theirs: TdDraft, units: readonly (readonly string[])[] = []): { merged: TdDraft; conflicts: TdFieldConflict[] } {
  const conflicts: TdFieldConflict[] = [];
  const pick = (field: string, b: unknown, m: unknown, t: unknown, unit?: string[]) => {
    if (same(m, b)) return t;
    if (same(t, b) || same(m, t)) return m;
    conflicts.push({ field, base: b, mine: m, theirs: t, ...(unit ? { unit } : {}) });
    return m;
  };
  const fields = [...new Set([...Object.keys(base.data), ...Object.keys(mine.data), ...Object.keys(theirs.data)])];
  const grouped = new Set(units.flat());
  const all = [...units.map((unit) => unit.filter((field) => fields.includes(field))).filter((unit) => unit.length), ...fields.filter((field) => !grouped.has(field)).map((field) => [field])];
  const data: Data = {};
  const of = (draft: TdDraft, unit: string[]) => Object.fromEntries(unit.map((field) => [field, draft.data[field]]));
  for (const unit of all) {
    if (unit.length === 1) {
      const value = pick(`data.${unit[0]}`, base.data[unit[0]], mine.data[unit[0]], theirs.data[unit[0]]);
      if (value !== undefined) data[unit[0]] = value;
      continue;
    }
    const value = pick(`data.${unit.join('+')}`, of(base, unit), of(mine, unit), of(theirs, unit), unit) as Data;
    for (const field of unit) if (value[field] !== undefined) data[field] = value[field];
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
    else if (conflict.unit) for (const field of conflict.unit) out.data[field] = (value as Data)[field];
    else out.data[conflict.field.slice('data.'.length)] = value;
  }
  return out;
}
