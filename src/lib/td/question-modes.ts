import type { TdContentType } from '@/lib/td/admin-api';
import { t } from '@/lib/td/i18n';

export type TdCategoryType = 'card-categories' | 'box-categories';

/** What one row of a mode is: a card, a subject, a question, a round. */
export type TdQuestionNoun = 'card' | 'subject' | 'question' | 'round';

export interface TdQuestionMode {
  key: string;
  label: string;
  type: TdContentType;
  noun: TdQuestionNoun;
  categoryType?: TdCategoryType;
  /** A daily game: its questions' categories are their puzzle keys. */
  puzzles?: true;
}

/** The game modes a question belongs to: the Questions page's Type filter, as
 *  the Quizball CMS's question list filters by question type. */
export const TD_QUESTION_MODES: readonly TdQuestionMode[] = [
  { key: 'round-1', label: t('Round I · ბარათონი'), type: 'cards', noun: 'card', categoryType: 'card-categories' },
  { key: 'round-2', label: t('Round II · გამარჯობა'), type: 'whoami-subjects', noun: 'subject' },
  { key: 'round-3', label: t('Round III · პაპა კარლოს ყუთი'), type: 'box-questions', noun: 'question', categoryType: 'box-categories' },
  { key: 'penalties', label: t('Penalties'), type: 'penalty-questions', noun: 'question' },
  { key: 'practice', label: t('Practice · ივარჯიშე'), type: 'practice-questions', noun: 'question' },
  { key: 'football-logic', label: t('Daily · Football Logic'), type: 'football-logic', noun: 'question', puzzles: true },
  { key: 'put-in-order', label: t('Daily · Put in Order'), type: 'put-in-order', noun: 'round', puzzles: true },
  { key: 'career-path', label: t('Daily · Career Path'), type: 'career-path', noun: 'question', puzzles: true },
];

/** The page of the question list that holds rows of this type (links from the release report). */
export function questionsHref(type: TdContentType, q?: string): string | null {
  const mode = TD_QUESTION_MODES.find((m) => m.type === type);
  if (!mode) return null;
  return `/td/questions?mode=${mode.key}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
}
