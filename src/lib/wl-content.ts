/**
 * Weekend League content import — client, round types, editor file formats.
 *
 * The upload reuses the bulk `.txt` parser and its bulk-create question
 * shape; this module only adds what is WL-specific: the five round types,
 * the format the editor writes in, tolerant numbering, and a typed client
 * for /api/v1/admin/wl/content/*.
 */
import createClient from 'openapi-fetch';
import type { components, paths } from '@/types/wl-content.api.generated';
import { AUTH_TOKEN_KEY } from './constants';
import { parseQuestionFile, toBulkCreateQuestion, type ParsedBulkQuestion, type ParseError } from './parsers/question-parser';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001').replace(/\/api\/v1\/?$/, '');

export const wlContentApi = createClient<paths>({ baseUrl: API_BASE_URL });
wlContentApi.use({
  onRequest: ({ request }) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (token) request.headers.set('Authorization', `Bearer ${token}`);
    }
    return request;
  },
});

export type WlContentKind = 'true_false' | 'put_in_order' | 'mcq_single' | 'career_path' | 'clue_chain';
export type WlContentCheckResponse = components['schemas']['WlContentCheckResponse'];
export type WlContentRowReport = WlContentCheckResponse['rows'][number];
export type WlContentBatch = components['schemas']['WlContentBatch'];
export type WlContentBatchDetail = components['schemas']['WlContentBatchDetail'];
export type WlContentRunway = components['schemas']['WlContentRunway'];
export type WlContentImportBody = paths['/api/v1/admin/wl/content/import']['post']['requestBody']['content']['application/json'];
export type WlContentQuestion = WlContentImportBody['questions'][number];

/** Every game (Sat 1, Sat 2, Sat 3, Sunday final) plays these five rounds in this order. */
export const WL_KINDS: Array<{ value: WlContentKind; label: string; round: string; perEvent: number; perGame: string }> = [
  { value: 'true_false', label: 'True / False', round: 'Round 1', perEvent: 28, perGame: '5 per game' },
  { value: 'put_in_order', label: 'Put in order', round: 'Round 2', perEvent: 28, perGame: '5 per game' },
  { value: 'mcq_single', label: 'Photo question', round: 'Round 3', perEvent: 28, perGame: '5 per game' },
  { value: 'career_path', label: 'Career path', round: 'Round 4', perEvent: 28, perGame: '5 per game' },
  { value: 'clue_chain', label: 'Who am I?', round: 'Round 5', perEvent: 12, perGame: '1 per game' },
];

export const WL_KIND_LABEL: Record<string, string> = { ...Object.fromEntries(WL_KINDS.map((k) => [k.value, k.label])), lineup: 'Weekend lineup' };
/** wl_questions.kind → upload type */
export const WL_ROUND_KIND_LABEL: Record<string, string> = {
  true_false: 'True / False', put_in_order: 'Put in order', mcq: 'Photo question', career_path: 'Career path', who_am_i: 'Who am I?',
};

export const WL_FORMAT_EXAMPLES: Record<WlContentKind, string> = {
  true_false: `1. Zinedine Zidane scored two goals in the 1998 FIFA World Cup final.
Answer: True
Difficulty: Easy

2. Harry Kane won a major club trophy during his time at Tottenham Hotspur.
Answer: False
Difficulty: Medium`,
  put_in_order: `1. Order these players by most all-time Premier League goals (High to Low)
Direction: desc
Items:
- Sergio Aguero
- Alan Shearer
- Thierry Henry
- Wayne Rooney
Answer:
1. Alan Shearer
2. Wayne Rooney
3. Sergio Aguero
4. Thierry Henry
Difficulty: Easy`,
  mcq_single: `1. Opened in 1957, this is the largest stadium in Europe by capacity. Which stadium is this?
Image: https://upload.wikimedia.org/wikipedia/commons/a/ad/Camp_Nou_aerial.jpg
A) Camp Nou*
B) Santiago Bernabéu
C) Wanda Metropolitano
D) Mestalla
Difficulty: Easy`,
  career_path: `1. Question: Ajax ➔ Inter Milan ➔ Arsenal
Answer: Dennis Bergkamp | Bergkamp
Difficulty: Easy

2. Question: Cobh Ramblers ➔ Nottingham Forest ➔ Manchester United ➔ Celtic
Answer: Roy Keane | Keane
Difficulty: Medium`,
  clue_chain: `1.
Clue 5: I began my career as a part-time player while working in a supermarket.
Clue 4: I hold the league record for the longest run without conceding (1,311 minutes).
Clue 3: I am the oldest player to win the Premier League, at 40.
Clue 2: I won the Champions League twice, 13 years apart.
Clue 1: I am a Dutch goalkeeper who had a late-career resurgence at Manchester United.
Answer: Edwin van der Sar | van der Sar
Difficulty: Medium`,
};

export const WL_FORMAT_NOTES: Record<WlContentKind, string[]> = {
  true_false: ['One statement per block, "Answer: True/False", "Difficulty: Easy/Medium/Hard".', 'Numbering is optional — blocks are split after each Difficulty line.'],
  put_in_order: ['Exactly 4 items. The Answer block lists all four in the correct top-to-bottom order.', 'Same prompt with a different item set is fine; the same four items ranked before is flagged.'],
  mcq_single: ['Add an Image line with a direct JPG/PNG/WebP URL — the round is drawn photo-first; text-only questions are flagged and only dealt when photos run out.', 'Mark the correct option with * — exactly one. Images are copied to our storage on publish; hosts that block downloads are reported.'],
  career_path: ['Clubs separated by ➔ (or ->). Answer: full name | short forms. Surname, first name and Georgian forms are added automatically.', 'Clubs without a crest in our registry are flagged so you can rename (e.g. "Inter" → "Inter Milan") or accept a blank badge.'],
  clue_chain: ['Exactly 5 clues, vaguest first — written top to bottom in the order the game reveals them. The numbers (5→1 or 1→5) are labels only.', 'A clue that contains the answer\'s surname is flagged.'],
};

/**
 * The editor's doc often has no "1." numbering (or restarts it per section).
 * The bulk parser needs one number per block, so when a file has none we
 * number the first line and every line that follows a Difficulty line.
 */
export function autoNumberBlocks(content: string): string {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  // Numbered files start with a number. Looking anywhere would be fooled by
  // the "1. Alan Shearer" lines inside a put-in-order Answer block.
  const first = lines.find((l) => l.trim() !== '') ?? '';
  if (/^\s*\d+[.)]\s+\S/.test(first)) return content;
  const out: string[] = [];
  let n = 0;
  let expectStart = true;
  for (const raw of lines) {
    const line = raw.replace(/ /g, ' ');
    if (!line.trim()) { out.push(line); continue; }
    if (expectStart) {
      n += 1;
      out.push(`${n}. ${line.trim()}`);
      expectStart = false;
    } else {
      out.push(line);
    }
    if (/^\s*Difficulty\s*:/i.test(line)) expectStart = true;
  }
  return out.join('\n');
}

/** Some editors paste "13. Clue 5 : …" — the block number and the first clue share a line. */
function splitNumberedClueStarts(content: string): string {
  return content.replace(/^(\s*\d+[.)])\s+(Clue\s+\d+\s*:)/gim, '$1\n$2');
}

export function parseWlFile(content: string, kind: WlContentKind): { questions: ParsedBulkQuestion[]; errors: ParseError[] } {
  let text = content.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  if (kind === 'clue_chain') text = splitNumberedClueStarts(text);
  text = autoNumberBlocks(text);
  const result = parseQuestionFile(text, kind, { clueOrder: 'as-listed' });
  // The generic parser checks counts, not that the Answer block is a
  // permutation of Items — a repeated name would silently rank the missing
  // item first. Catch it here with a line number the editor can act on.
  const questions = result.questions.filter((q) => {
    if (q.kind !== 'put_in_order') return true;
    const norm = (v: string) => v.trim().toLowerCase();
    const items = [...new Set(q.items.map(norm))].sort();
    const answer = [...new Set(q.orderedAnswer.map(norm))].sort();
    const ok = items.length === q.items.length && answer.length === q.orderedAnswer.length && items.join('|') === answer.join('|');
    if (!ok) {
      result.errors.push({ lineNumber: q.lineNumber, questionNumber: q.questionNumber, severity: 'error', message: 'Answer must list each of the 4 items exactly once' });
    }
    return ok;
  });
  return { questions, errors: result.errors };
}

export function toWlQuestion(q: ParsedBulkQuestion): WlContentQuestion {
  return toBulkCreateQuestion(q, 'en') as unknown as WlContentQuestion;
}

export function rowSummary(q: ParsedBulkQuestion): string {
  switch (q.kind) {
    case 'career_path': return `${q.displayAnswer} — ${q.clubs.join(' → ')}`;
    case 'clue_chain': return q.displayAnswer;
    case 'put_in_order': return `${q.prompt} — ${q.orderedAnswer.join(' > ')}`;
    case 'mcq_single': return q.prompt;
    case 'true_false': return `${q.prompt} [${q.answer ? 'TRUE' : 'FALSE'}]`;
    default: return 'prompt' in q ? String(q.prompt) : '';
  }
}

/**
 * The chosen file, with the input cleared: browsers fire no change event when
 * the same path is picked again, so an editor who fixed a file and re-selects
 * it would otherwise keep seeing the old results.
 */
export function takeSelectedFile(input: HTMLInputElement): File | null {
  const file = input.files?.[0] ?? null;
  input.value = '';
  return file;
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
