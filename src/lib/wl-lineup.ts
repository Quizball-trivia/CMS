/**
 * Weekend League lineup file — one .txt with every round of the games the
 * editor chose in the CMS. Game and round headings place each question;
 * every question keeps the syntax of the one-type uploader (parseWlFile).
 *
 *   === SATURDAY GAME 1 ===
 *   --- Round 1: True or False ---
 *   1. …
 *   --- Reserves: Career path ---     (optional, up to 2 per round type)
 */
import type { ParsedBulkQuestion } from './parsers/question-parser';
import { parseWlFile, WL_FORMAT_EXAMPLES, type WlContentKind } from './wl-content';

export const WL_GAME_NAMES = ['Saturday Game 1', 'Saturday Game 2', 'Saturday Game 3', 'Sunday Final'] as const;
export const WL_RESERVES_PER_TYPE = 2;

/** Every game plays these five rounds in this order (wl_questions round_index 0–4). */
export const WL_LINEUP_ROUNDS: ReadonlyArray<{ index: number; kind: string; type: WlContentKind; label: string; main: number }> = [
  { index: 0, kind: 'true_false', type: 'true_false', label: 'True or False', main: 5 },
  { index: 1, kind: 'put_in_order', type: 'put_in_order', label: 'Put in order', main: 5 },
  { index: 2, kind: 'mcq', type: 'mcq_single', label: 'Photo', main: 5 },
  { index: 3, kind: 'career_path', type: 'career_path', label: 'Career path', main: 5 },
  { index: 4, kind: 'who_am_i', type: 'clue_chain', label: 'Who am I', main: 1 },
];

export type WlLineupScope = 'game_0' | 'game_1' | 'game_2' | 'game_3' | 'saturday' | 'weekend';

export const WL_LINEUP_SCOPES: ReadonlyArray<{ value: WlLineupScope; label: string; games: number[] }> = [
  { value: 'game_0', label: 'Saturday · Game 1', games: [0] },
  { value: 'game_1', label: 'Saturday · Game 2', games: [1] },
  { value: 'game_2', label: 'Saturday · Game 3', games: [2] },
  { value: 'game_3', label: 'Sunday · Final', games: [3] },
  { value: 'saturday', label: 'All Saturday games (1, 2 and 3)', games: [0, 1, 2] },
  { value: 'weekend', label: 'Entire weekend (Saturday games 1–3 + Sunday final)', games: [0, 1, 2, 3] },
];

export interface LineupSlot { game_index: number; round_index: number | null; question_index: number | null; reserve_ordinal: number }

export interface LineupItem {
  question: ParsedBulkQuestion;
  slot: LineupSlot;
  /** 1-based line in the uploaded file where the question starts. */
  line: number;
  /** "Saturday Game 1 · Round 2 (Put in order) · Q3" / "… · Reserve 1 (Career path)" */
  where: string;
}

export interface LineupProblem { line: number | null; where: string; message: string; severity: 'error' | 'warning' }

export function slotLabel(slot: LineupSlot): string {
  const game = WL_GAME_NAMES[slot.game_index] ?? `Game ${slot.game_index + 1}`;
  if (slot.reserve_ordinal > 0) return `${game} · Reserve ${slot.reserve_ordinal}`;
  const round = WL_LINEUP_ROUNDS[slot.round_index ?? 0]!;
  return `${game} · Round ${round.index + 1} (${round.label}) · Q${(slot.question_index ?? 0) + 1}`;
}

const GAME_HEADING = /^\s*={2,}\s*(.*?)\s*=*\s*$/;
const SECTION_HEADING = /^\s*-{2,}\s*(.*?)\s*-*\s*$/;

function gameFromHeading(text: string): number | null {
  const t = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const game = /\bgame\s*([123])\b/.exec(t);
  if (game && !/\bsun(day)?\b/.test(t)) return Number(game[1]) - 1;
  if (/\bfinal\b/.test(t) || /^sun(day)?$/.test(t)) return 3;
  return null;
}

const TYPE_WORDS: Array<[RegExp, number]> = [
  [/\btrue\s*(or|\/|and)?\s*false\b|\btf\b/, 0],
  [/\bput\s*in\s*order\b|\border\b|\branking\b/, 1],
  [/\bphotos?\b|\bpicture\b|\bimage\b|\bmultiple\s*choice\b/, 2],
  [/\bcareer\b/, 3],
  [/\bwho\s*am\s*i\b|\bclues?\b/, 4],
];

function sectionFromHeading(text: string): { reserve: boolean; round: number | null; problem: string | null } {
  const t = text.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9/]+/g, ' ').trim();
  const reserve = /^reserves?\b/.test(t);
  const num = /\bround\s*([1-5])\b/.exec(t);
  const byNumber = num ? Number(num[1]) - 1 : null;
  const byType = TYPE_WORDS.find(([re]) => re.test(t))?.[1] ?? null;
  if (byNumber !== null && byType !== null && byNumber !== byType) {
    return { reserve, round: null, problem: `"Round ${byNumber + 1}" is ${WL_LINEUP_ROUNDS[byNumber]!.label}, but the heading also says ${WL_LINEUP_ROUNDS[byType]!.label}` };
  }
  const round = byNumber ?? byType;
  if (round === null) return { reserve, round: null, problem: 'Say which round this is, e.g. "--- Round 3: Photo ---" or "--- Reserves: Career path ---"' };
  return { reserve, round, problem: null };
}

/**
 * The who-am-I cleanup in parseWlFile turns "13. Clue 5: …" into two lines,
 * which would shift every later line number. Do that split here with a map
 * back to the file's own lines, so parseWlFile sees nothing left to split.
 */
function splitClueStarts(lines: Array<{ text: string; line: number }>): Array<{ text: string; line: number }> {
  const out: Array<{ text: string; line: number }> = [];
  for (const l of lines) {
    const m = /^(\s*\d+[.)])\s+(Clue\s+\d+\s*:.*)$/i.exec(l.text);
    if (m) { out.push({ text: m[1]!, line: l.line }, { text: m[2]!, line: l.line }); continue; }
    out.push(l);
  }
  return out;
}

interface Section { game: number; heading: number; reserve: boolean; round: number; lines: Array<{ text: string; line: number }> }

/** Parse a lineup file for the games the editor chose (`scopeGames`, game_index 0–3). */
export function parseLineupFile(content: string, scopeGames: readonly number[]): { items: LineupItem[]; problems: LineupProblem[] } {
  const problems: LineupProblem[] = [];
  const err = (line: number | null, where: string, message: string) => problems.push({ line, where, message, severity: 'error' });
  const lines = content.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');

  const games = new Map<number, number>(); // game → heading line
  const sections: Section[] = [];
  let game: number | null = null;
  let section: Section | null = null;
  let strayReported = false;

  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const text = raw.replace(/ /g, ' ');
    const g = GAME_HEADING.exec(text);
    if (g && /={2,}/.test(text)) {
      const idx = gameFromHeading(g[1] ?? '');
      section = null;
      if (idx === null) { err(lineNo, 'Game heading', `"${text.trim()}" is not a game. Use === SATURDAY GAME 1 ===, === SATURDAY GAME 2 ===, === SATURDAY GAME 3 === or === SUNDAY FINAL ===`); game = null; return; }
      if (games.has(idx)) err(lineNo, WL_GAME_NAMES[idx]!, `${WL_GAME_NAMES[idx]} appears twice (first on line ${games.get(idx)})`);
      games.set(idx, lineNo);
      game = idx;
      return;
    }
    const s = SECTION_HEADING.exec(text);
    if (s && /^\s*-{2,}/.test(text) && /[a-z]/i.test(s[1] ?? '')) {
      if (game === null) { err(lineNo, 'Round heading', 'Put round headings under a game heading such as === SATURDAY GAME 1 ==='); section = null; return; }
      const parsed = sectionFromHeading(s[1] ?? '');
      if (parsed.problem) { err(lineNo, WL_GAME_NAMES[game]!, parsed.problem); section = null; return; }
      const dup = sections.find((x) => x.game === game && x.reserve === parsed.reserve && x.round === parsed.round);
      const label = `${WL_GAME_NAMES[game]} · ${parsed.reserve ? 'Reserves' : `Round ${parsed.round! + 1}`} (${WL_LINEUP_ROUNDS[parsed.round!]!.label})`;
      if (dup) err(lineNo, label, `This section appears twice in ${WL_GAME_NAMES[game]} (first on line ${dup.heading}) — put all its questions under one heading`);
      section = { game, heading: lineNo, reserve: parsed.reserve, round: parsed.round!, lines: [] };
      sections.push(section);
      return;
    }
    if (section) { (section as Section).lines.push({ text, line: lineNo }); return; }
    if (!text.trim() || text.trim().startsWith('#')) return;
    if (!strayReported) {
      strayReported = true;
      err(lineNo, game === null ? 'Before the first game' : WL_GAME_NAMES[game]!,
        game === null
          ? 'Questions must sit under a game and round heading — start with === SATURDAY GAME 1 === and --- Round 1: True or False --- (instruction lines may start with #)'
          : 'This line is not under a round heading — add one such as --- Round 1: True or False ---');
    }
  });

  // Scope: exactly the chosen games, nothing else.
  for (const g of scopeGames) {
    if (!games.has(g)) err(null, WL_GAME_NAMES[g]!, `You chose ${WL_GAME_NAMES[g]}, but the file has no === ${WL_GAME_NAMES[g]!.toUpperCase()} === section`);
  }
  for (const [g, line] of games) {
    if (!scopeGames.includes(g)) err(line, WL_GAME_NAMES[g]!, `The file has ${WL_GAME_NAMES[g]}, which is not part of what you chose to upload — pick a wider scope or remove this game`);
  }

  const items: LineupItem[] = [];
  for (const sec of sections) {
    const round = WL_LINEUP_ROUNDS[sec.round]!;
    const where = `${WL_GAME_NAMES[sec.game]} · ${sec.reserve ? 'Reserves' : `Round ${round.index + 1}`} (${round.label})`;
    const body = round.type === 'clue_chain' ? splitClueStarts(sec.lines) : sec.lines;
    // Leading/trailing blank lines are harmless; the parser needs the first question at the top.
    let start = 0; while (start < body.length && !body[start]!.text.trim()) start += 1;
    const used = body.slice(start);
    const lineOf = (n: number) => used[Math.max(0, Math.min(used.length - 1, n - 1))]?.line ?? sec.heading;
    if (!used.some((l) => l.text.trim())) {
      if (!sec.reserve) err(sec.heading, where, `No questions under this heading — ${round.label} needs ${round.main}`);
      continue;
    }
    const parsed = parseWlFile(used.map((l) => l.text).join('\n'), round.type);
    for (const e of parsed.errors) {
      problems.push({ line: lineOf(e.lineNumber), where: e.questionNumber ? `${where} · question ${e.questionNumber}` : where, message: e.message, severity: e.severity });
    }
    parsed.questions.forEach((q, i) => {
      const slot: LineupSlot = sec.reserve
        ? { game_index: sec.game, round_index: null, question_index: null, reserve_ordinal: i + 1 }
        : { game_index: sec.game, round_index: round.index, question_index: i, reserve_ordinal: 0 };
      items.push({ question: q, slot, line: lineOf(q.lineNumber), where: sec.reserve ? `${where} · Reserve ${i + 1}` : `${where} · Q${i + 1}` });
    });
    const expected = sec.reserve ? null : round.main;
    if (expected !== null && parsed.questions.length !== expected && !parsed.errors.some((e) => e.severity === 'error')) {
      err(sec.heading, where, `${parsed.questions.length} question${parsed.questions.length === 1 ? '' : 's'} — this round needs exactly ${expected}`);
    }
    if (sec.reserve && parsed.questions.length > WL_RESERVES_PER_TYPE) {
      err(sec.heading, where, `${parsed.questions.length} reserves — at most ${WL_RESERVES_PER_TYPE} per round type (the pool fills any you leave out)`);
    }
  }
  // Every chosen game needs all five rounds.
  for (const g of scopeGames) {
    if (!games.has(g)) continue;
    for (const round of WL_LINEUP_ROUNDS) {
      if (!sections.some((s) => s.game === g && !s.reserve && s.round === round.index)) {
        err(games.get(g)!, WL_GAME_NAMES[g]!, `Missing --- Round ${round.index + 1}: ${round.label} --- (${round.main} question${round.main === 1 ? '' : 's'})`);
      }
    }
  }
  problems.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return { items, problems };
}

// ─── templates ────────────────────────────────────────────────────────────────

const TEMPLATE_HEADER = `# WEEKEND LEAGUE LINEUP
# Pick the weekend and the games in the CMS first — this file only holds the questions.
# Each game needs all five rounds, in this order:
#   Round 1: True or False (5) · Round 2: Put in order (5) · Round 3: Photo (5)
#   Round 4: Career path (5)   · Round 5: Who am I (1)
# Reserves are optional (up to 2 per round type); any you leave out are taken from the pool.
# Lines starting with # are ignored. Replace the example questions with your own.
`;

const PLACEHOLDER: Record<WlContentKind, (tag: string) => string> = {
  true_false: (tag) => `${tag} Write a true-or-false statement here.\nAnswer: True\nDifficulty: Medium`,
  put_in_order: (tag) => `${tag} Write what to put in order here (High to Low)\nDirection: desc\nItems:\n- Item A\n- Item B\n- Item C\n- Item D\nAnswer:\n1. Item A\n2. Item B\n3. Item C\n4. Item D\nDifficulty: Medium`,
  mcq_single: (tag) => `${tag} Write the photo question here\nImage: https://example.com/your-photo.jpg\nA) Correct answer*\nB) Wrong answer\nC) Wrong answer\nD) Wrong answer\nDifficulty: Medium`,
  career_path: (tag) => `Question: ${tag} First club ➔ Second club ➔ Third club\nAnswer: Player Name | Surname\nDifficulty: Medium`,
  clue_chain: (tag) => `Clue 5: ${tag} The vaguest clue comes first.\nClue 4: A slightly easier clue.\nClue 3: An easier clue.\nClue 2: A strong hint.\nClue 1: The giveaway clue.\nAnswer: Player Name | Surname\nDifficulty: Medium`,
};

/** A round: the real format example(s) first, then clearly marked placeholders up to the round's size. */
function exampleRound(type: WlContentKind, count: number, gameLabel: string): string {
  const examples = WL_FORMAT_EXAMPLES[type].split(/\n\s*\n(?=\d+[.)])/).map((b) => b.replace(/^\d+[.)]\s*\n?/, ''));
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const block = i < examples.length ? examples[i]! : PLACEHOLDER[type](`[${gameLabel} · question ${i + 1} — replace]`);
    out.push(type === 'clue_chain' ? `${i + 1}.\n${block}` : `${i + 1}. ${block}`);
  }
  return out.join('\n\n');
}

function gameTemplate(game: number, withReserveExample: boolean): string {
  const name = WL_GAME_NAMES[game]!;
  const parts = [`=== ${name.toUpperCase()} ===`];
  for (const round of WL_LINEUP_ROUNDS) {
    parts.push(`--- Round ${round.index + 1}: ${round.label} ---\n${exampleRound(round.type, round.main, name)}`);
  }
  if (withReserveExample) parts.push(`--- Reserves: Career path ---\n${exampleRound('career_path', 1, `${name} reserve`)}`);
  return parts.join('\n\n');
}

export function lineupTemplate(scope: WlLineupScope): { filename: string; text: string } {
  const games = WL_LINEUP_SCOPES.find((s) => s.value === scope)!.games;
  const body = games.map((g, i) => gameTemplate(g, i === 0)).join('\n\n\n');
  const name = scope === 'weekend' ? 'full-weekend' : scope === 'saturday' ? 'saturday' : WL_GAME_NAMES[games[0]!]!.toLowerCase().replace(/\s+/g, '-');
  return { filename: `wl-lineup-template-${name}.txt`, text: `${TEMPLATE_HEADER}\n${body}\n` };
}

/** Saturday = the event's week_key; the final (game index 3) is played on Sunday. */
export function wlGameDay(weekKey: string, gameIndex: number): string {
  const d = new Date(`${weekKey}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return weekKey;
  if (gameIndex >= 3) d.setUTCDate(d.getUTCDate() + 1);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
