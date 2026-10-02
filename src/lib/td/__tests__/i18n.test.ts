import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KA, KA_PARTS } from '../i18n/ka';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const DIRS = ['components/td', 'app/td', 'lib/td', 'hooks', 'providers', 'types'];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return name === '__tests__' || name === 'pinned' || name === 'i18n' ? [] : sources(file);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [file] : [];
  });
}

const literal = String.raw`'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"`;
const unquote = (single: string | undefined, double: string | undefined) =>
  (single ?? double ?? '').replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');

/** Every text looked up in the workspace's source: `t('…')`, `tr('…')`, and the plural form of `tn(n, '…', '…')`. */
function usedTexts(): Map<string, string> {
  const used = new Map<string, string>();
  for (const dir of DIRS) {
    for (const file of sources(path.join(ROOT, dir))) {
      const text = readFileSync(file, 'utf8');
      if (!/@\/lib\/td\/i18n|from '\.\.?\/(?:\.\.\/)*i18n'/.test(text)) continue;
      for (const m of text.matchAll(new RegExp(String.raw`(?<![\w.])tr?\(\s*(?:${literal})`, 'g'))) used.set(unquote(m[1], m[2]), file);
      for (const m of text.matchAll(new RegExp(String.raw`(?<![\w.])tn\(\s*[^,]+,\s*(?:${literal})\s*,\s*(?:${literal})`, 'g'))) used.set(unquote(m[3], m[4]), file);
    }
  }
  return used;
}

const marks = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('the Georgian of the Table Derby workspace', () => {
  it('has every text the workspace looks up', () => {
    const missing = [...usedTexts()].filter(([text]) => !(text in KA)).map(([text, file]) => `${path.relative(ROOT, file)}: ${text}`);
    expect(missing).toEqual([]);
  });

  it('keeps the placeholders of each text', () => {
    const wrong = Object.entries(KA)
      .filter(([source, georgian]) => {
        const want = marks(source);
        // A counted phrase may name its count in Georgian or leave it to the source's.
        const got = marks(georgian);
        return got.some((name) => !want.includes(name) && name !== 'count') || want.some((name) => !got.includes(name));
      })
      .map(([source]) => source);
    expect(wrong).toEqual([]);
  });

  it('gives a text one Georgian wording, whichever file has it', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const part of Object.values(KA_PARTS)) {
      for (const [source, georgian] of Object.entries(part)) {
        if (seen.has(source) && seen.get(source) !== georgian) clashes.push(source);
        seen.set(source, georgian);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('is Georgian: no entry is left in English', () => {
    const same = Object.entries(KA).filter(([source, georgian]) => source === georgian && /[a-z]{4,}/.test(source)).map(([source]) => source);
    expect(same).toEqual([]);
  });
});
