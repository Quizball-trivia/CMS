import type { TdContentType } from './admin-api';

export type TdDailyGameKey = 'footballLogic' | 'putInOrder' | 'careerPath';

/** A day of a daily game: one set (puzzle) of this many questions (Put in Order: rounds); the API checks the same
 *  (DAILY_DAY_SIZES in the TD contracts package). */
export const TD_DAILY_DAY_SIZES: Record<TdDailyGameKey, number> = { footballLogic: 10, putInOrder: 4, careerPath: 10 };

export const TD_DAILY_TYPES: Record<TdDailyGameKey, Extract<TdContentType, 'football-logic' | 'put-in-order' | 'career-path'>> = {
  footballLogic: 'football-logic',
  putInOrder: 'put-in-order',
  careerPath: 'career-path',
};

/** The key prefix of the days an upload makes. */
export const TD_DAY_PREFIX: Record<TdDailyGameKey, string> = { footballLogic: 'football-logic', putInOrder: 'put-in-order', careerPath: 'career-path' };

export const gameOfType = (type: TdContentType): TdDailyGameKey | null =>
  (Object.keys(TD_DAILY_TYPES) as TdDailyGameKey[]).find((game) => TD_DAILY_TYPES[game] === type) ?? null;

/** A short stable hash (FNV-1a, 32 bits) of a text, as 8 hex digits. */
export function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** The days an upload makes: its questions cut into days of the game's size, in file order. A day's key is made from
 *  what it holds, so the same file read again makes the same days (and its import is recognised), and two uploads
 *  never share a day. */
export function uploadDays<Q>(game: TdDailyGameKey, questions: readonly Q[], fingerprint: (question: Q) => string): { day: number; key: string }[] {
  const size = TD_DAILY_DAY_SIZES[game];
  const keys: string[] = [];
  for (let start = 0; start < questions.length; start += size)
    keys.push(`${TD_DAY_PREFIX[game]}-${shortHash(questions.slice(start, start + size).map(fingerprint).join('\n'))}`);
  return questions.map((_, index) => ({ day: Math.floor(index / size) + 1, key: keys[Math.floor(index / size)]! }));
}
