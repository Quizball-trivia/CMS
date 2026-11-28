import type { HarnessFeedbackItem } from '@/types';

// What the Feedback page works out from the list it is given: no fetching, no React.

export type KindFilter = 'all' | 'bug' | 'feedback' | 'idea' | 'rating' | 'other';
export type LanguageFilter = 'all' | 'ka' | 'translated';

export const KINDS: Array<{ key: KindFilter; label: string }> = [
  { key: 'all', label: 'Everything' },
  { key: 'bug', label: 'Bugs' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'idea', label: 'Ideas' },
  { key: 'rating', label: 'After a game' },
  { key: 'other', label: 'Other' },
];

export const KIND_LOOK: Record<HarnessFeedbackItem['category'], { label: string; tone: string }> = {
  bug: { label: 'Bug', tone: 'bg-red-50 text-red-700' },
  feedback: { label: 'Feedback', tone: 'bg-sky-50 text-sky-700' },
  idea: { label: 'Idea', tone: 'bg-violet-50 text-violet-700' },
  rating: { label: 'After a game', tone: 'bg-amber-50 text-amber-800' },
  other: { label: 'Other', tone: 'bg-slate-100 text-slate-700' },
};

export const SOURCE_LABEL: Record<HarnessFeedbackItem['source'], string> = {
  form: 'Contact form',
  season3: 'Season 3 survey',
  game: 'Comment after a game',
};

/** A language's name in English ("Spanish"), or the code when the browser does not know it. */
export function languageName(code: string | null): string {
  if (!code || code === 'unknown') return 'Unknown language';
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** An attachment's address when it is a real https page, else null: nothing typed by a player is trusted as a link. */
export function safeAttachment(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** An email address a "write back" link may carry, else null. */
export function safeEmail(email: string | null): string | null {
  return email && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(email) ? email : null;
}

export function filterFeedback(items: HarnessFeedbackItem[], f: { kind: KindFilter; language: LanguageFilter; search: string }): HarnessFeedbackItem[] {
  const q = f.search.trim().toLowerCase();
  return items.filter((i) => {
    if (f.kind !== 'all' && i.category !== f.kind) return false;
    if (f.language === 'ka' && i.language !== 'ka') return false;
    if (f.language === 'translated' && !i.english) return false;
    if (!q) return true;
    return [i.message, i.english, i.nickname, i.email, i.game, i.context, `#${i.number}`].some((v) => v?.toLowerCase().includes(q));
  });
}

/** How many of each kind, for the filter buttons. */
export function countByKind(items: HarnessFeedbackItem[]): Record<KindFilter, number> {
  const n: Record<KindFilter, number> = { all: items.length, bug: 0, feedback: 0, idea: 0, rating: 0, other: 0 };
  for (const i of items) n[i.category]++;
  return n;
}

/** How many arrived in the last `days` days. */
export function arrivedWithin(items: HarnessFeedbackItem[], days: number, now: number): number {
  const since = now - days * 86_400_000;
  return items.filter((i) => new Date(i.receivedAt).getTime() >= since).length;
}
