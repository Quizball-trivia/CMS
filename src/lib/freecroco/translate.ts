export type Translate = (source: string, vars?: Record<string, string | number>) => string;

/** English as written, with `{name}` filled: what the validators use when no translator is passed in. */
export const plain: Translate = (source, vars) =>
  vars ? source.replace(/\{(\w+)\}/g, (mark, name: string) => (name in vars ? String(vars[name]) : mark)) : source;
