/**
 * The Table Derby workspace's language. Its staff read Georgian, so every
 * deployed build is Georgian; English, the language the text is written in
 * here, is kept for the tests and the smoke build (NEXT_PUBLIC_TD_LANG=en).
 * The language is fixed at build time: the server and the browser always
 * render the same text.
 *
 * Text is written in English at its place of use and looked up by that
 * English: `t('Save')`. Whole sentences only, with `{name}` for what varies,
 * so a translation can order its words as Georgian needs.
 */
import type { ReactNode } from "react";
import { KA } from "./ka";

export type TdLang = "ka" | "en";

export const TD_LANG: TdLang =
  process.env.NEXT_PUBLIC_TD_LANG === "en" ? "en" : "ka";

/** For dates and numbers. */
export const TD_LOCALE = TD_LANG === "ka" ? "ka-GE" : "en-GB";

type Vars = Record<string, string | number>;

const fill = (text: string, vars?: Vars) =>
  vars
    ? text.replace(/\{(\w+)\}/g, (mark, name: string) =>
        name in vars ? String(vars[name]) : mark,
      )
    : text;

const lookup = (source: string) =>
  TD_LANG === "ka" ? (KA[source] ?? source) : source;

export function t(source: string, vars?: Vars): string {
  return fill(lookup(source), vars);
}

/** A word that means different things in different places ("Open" the action,
 *  "Open" not closed yet): the context picks its Georgian, filed under
 *  `source [context]`. English is the source as it stands. */
export function tc(source: string, context: string, vars?: Vars): string {
  return fill(
    TD_LANG === "ka"
      ? (KA[`${source} [${context}]`] ?? lookup(source))
      : source,
    vars,
  );
}

/** A counted phrase. English picks `one` or `other` by the count; Georgian has
 *  one form (a noun stays singular after a number), filed under `other`.
 *  `{count}` is filled in. */
export function tn(
  count: number,
  one: string,
  other: string,
  vars?: Vars,
): string {
  const all = { count, ...vars };
  return fill(
    TD_LANG === "ka" ? lookup(other) : count === 1 ? one : other,
    all,
  );
}

/** A sentence with elements inside it: `{name}` marks where each one goes. */
export function tr(
  source: string,
  parts: Record<string, ReactNode>,
): ReactNode[] {
  return lookup(source)
    .split(/(\{\w+\})/)
    .filter((piece) => piece !== "")
    .map((piece) => {
      const name = /^\{(\w+)\}$/.exec(piece)?.[1];
      return name !== undefined && name in parts ? parts[name] : piece;
    });
}
