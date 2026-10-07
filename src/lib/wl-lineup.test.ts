import { describe, expect, it } from 'vitest';
import { lineupTemplate, parseLineupFile, WL_LINEUP_SCOPES } from './wl-lineup';

const tf = (n: number, tag: string) => `${n}. ${tag} statement number ${n} is a fact.\nAnswer: True\nDifficulty: Easy`;
const pio = (n: number, tag: string) => `${n}. ${tag} order ${n} (High to Low)\nDirection: desc\nItems:\n- A${n}\n- B${n}\n- C${n}\n- D${n}\nAnswer:\n1. A${n}\n2. B${n}\n3. C${n}\n4. D${n}\nDifficulty: Medium`;
const photo = (n: number, tag: string) => `${n}. ${tag} photo ${n}?\nImage: https://upload.wikimedia.org/p${n}.jpg\nA) Right ${n}*\nB) Wrong\nC) Wrong\nD) Wrong\nDifficulty: Medium`;
const career = (n: number, tag: string) => `${n}. Question: ${tag}Club${n} ➔ Other${n} ➔ Third${n}\nAnswer: Player ${tag}${n} | ${tag}${n}\nDifficulty: Hard`;
const who = (tag: string) => `1.\nClue 5: ${tag} vague\nClue 4: ${tag} less vague\nClue 3: ${tag} middle\nClue 2: ${tag} strong\nClue 1: ${tag} giveaway\nAnswer: Mystery ${tag} | ${tag}\nDifficulty: Hard`;
const range = (k: number) => Array.from({ length: k }, (_, i) => i + 1);

function game(heading: string, tag: string, opts: { tfCount?: number; reserves?: string } = {}): string {
  return [
    `=== ${heading} ===`,
    '--- Round 1: True or False ---', range(opts.tfCount ?? 5).map((n) => tf(n, tag)).join('\n\n'),
    '--- Round 2: Put in order ---', range(5).map((n) => pio(n, tag)).join('\n\n'),
    '--- Round 3: Photo ---', range(5).map((n) => photo(n, tag)).join('\n\n'),
    '--- Round 4: Career path ---', range(5).map((n) => career(n, tag)).join('\n\n'),
    '--- Round 5: Who am I ---', who(tag),
    opts.reserves ?? '',
  ].join('\n\n');
}

describe('parseLineupFile', () => {
  it('places one full game at exact slots', () => {
    const { items, problems } = parseLineupFile(`# instructions are ignored\n\n${game('SATURDAY GAME 2', 'g2')}`, [1]);
    expect(problems).toEqual([]);
    expect(items).toHaveLength(21);
    expect(items.every((i) => i.slot.game_index === 1 && i.slot.reserve_ordinal === 0)).toBe(true);
    const pio3 = items.find((i) => i.slot.round_index === 1 && i.slot.question_index === 2)!;
    expect(pio3.question.kind).toBe('put_in_order');
    expect(pio3.where).toBe('Saturday Game 2 · Round 2 (Put in order) · Q3');
    expect(items.filter((i) => i.slot.round_index === 4)).toHaveLength(1);
  });

  it('accepts tolerant headings, reserves and the whole weekend', () => {
    const reserves = `--- Reserves: Career path ---\n${career(1, 'r')}\n\n${career(2, 'r')}`;
    const text = [
      game('Saturday game 1', 'a', { reserves }), game('SAT - GAME 2', 'b'), game('game 3', 'c'), game('Sunday Final', 'd'),
    ].join('\n\n');
    const { items, problems } = parseLineupFile(text, [0, 1, 2, 3]);
    expect(problems).toEqual([]);
    expect(items).toHaveLength(21 * 4 + 2);
    const res = items.filter((i) => i.slot.reserve_ordinal > 0);
    expect(res.map((r) => [r.slot.game_index, r.slot.reserve_ordinal, r.question.kind])).toEqual([[0, 1, 'career_path'], [0, 2, 'career_path']]);
  });

  it('refuses games outside the chosen scope and reports missing ones', () => {
    const { problems } = parseLineupFile(`${game('SATURDAY GAME 1', 'a')}\n\n${game('SUNDAY FINAL', 'd')}`, [0, 1, 2]);
    const msgs = problems.map((p) => p.message).join('\n');
    expect(msgs).toMatch(/Sunday Final, which is not part of what you chose/);
    expect(msgs).toMatch(/You chose Saturday Game 2, but the file has no === SATURDAY GAME 2 === section/);
    expect(msgs).toMatch(/You chose Saturday Game 3/);
  });

  it('checks round sizes and missing rounds with the heading line', () => {
    const text = game('SATURDAY GAME 1', 'a', { tfCount: 4 }).replace(/--- Round 5: Who am I ---[\s\S]*$/, '');
    const { problems } = parseLineupFile(text, [0]);
    const tfProblem = problems.find((p) => /this round needs exactly 5/.test(p.message))!;
    expect(tfProblem.where).toBe('Saturday Game 1 · Round 1 (True or False)');
    expect(tfProblem.line).toBe(text.split('\n').findIndex((l) => l.startsWith('--- Round 1')) + 1);
    expect(problems.some((p) => /Missing --- Round 5: Who am I ---/.test(p.message))).toBe(true);
  });

  it('maps question errors to the line in the uploaded file, even after a split clue line', () => {
    const base = game('SUNDAY FINAL', 'f').replace(/1\.\nClue 5: f vague/, '1. Clue 5: f vague');
    const broken = base.replace('Answer: Player f3 | f3\nDifficulty: Hard', 'Answer: Player f3 | f3\nDifficulty: Impossible');
    const { problems } = parseLineupFile(broken, [3]);
    const bad = problems.find((p) => p.severity === 'error')!;
    const expectedLine = broken.split('\n').findIndex((l) => l.includes('Difficulty: Impossible')) + 1;
    expect(bad.where).toMatch(/Sunday Final · Round 4 \(Career path\)/);
    expect(Math.abs((bad.line ?? 0) - expectedLine)).toBeLessThanOrEqual(3);
    // The who-am-I line split must not shift anything: its question starts on its own line.
    const ok = parseLineupFile(base, [3]);
    const whoItem = ok.items.find((i) => i.slot.round_index === 4)!;
    expect(base.split('\n')[whoItem.line - 1]).toMatch(/^1\. Clue 5/);
  });

  it('flags unknown headings, mismatched round names, stray lines and too many reserves', () => {
    const text = [
      'A question before any heading?',
      '=== SATURDAY GAME 4 ===',
      '=== SATURDAY GAME 1 ===',
      '--- Round 2: Photo ---',
      '--- Reserves: True or False ---', tf(1, 'x'), tf(2, 'x'), tf(3, 'x'),
    ].join('\n');
    const msgs = parseLineupFile(text, [0]).problems.map((p) => p.message).join('\n');
    expect(msgs).toMatch(/Questions must sit under a game and round heading/);
    expect(msgs).toMatch(/is not a game/);
    expect(msgs).toMatch(/"Round 2" is Put in order, but the heading also says Photo/);
    expect(msgs).toMatch(/3 reserves — at most 2/);
  });

  it('ships templates that parse for every scope', () => {
    for (const scope of WL_LINEUP_SCOPES) {
      const { text } = lineupTemplate(scope.value);
      const { items, problems } = parseLineupFile(text, scope.games);
      expect(problems.filter((p) => p.severity === 'error'), scope.value).toEqual([]);
      expect(items.filter((i) => i.slot.reserve_ordinal === 0)).toHaveLength(21 * scope.games.length);
    }
  });
});
