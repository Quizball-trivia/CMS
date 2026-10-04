import { useMemo } from 'react';
import { Archive, Check, Pencil, Send, type LucideIcon } from 'lucide-react';
import { useTdAllRows } from '@/hooks/use-td-content';
import type { TdContentRow, TdContentStatus } from '@/lib/td/admin-api';
import { t, tn } from '@/lib/td/i18n';

export type TdCategoryType = 'card-categories' | 'box-categories';
export type TdCategoryRow = TdContentRow<TdCategoryType>;
type ChildType = 'cards' | 'box-questions';

/** The two rounds that have categories: what their categories and their cards or questions are. */
export const TD_CATEGORY_ROUNDS: ReadonlyArray<{ type: TdCategoryType; child: ChildType; label: string; empty: string }> = [
  { type: 'card-categories', child: 'cards', label: t('Round I · ბარათონი'), empty: t('No card categories yet') },
  { type: 'box-categories', child: 'box-questions', label: t('Round III · პაპა კარლოს ყუთი'), empty: t('No box categories yet') },
];

export const roundOf = (type: TdCategoryType) => TD_CATEGORY_ROUNDS.find((round) => round.type === type)!;

/** A card category is told from a box category by its data: a prompt or a title. */
export const categoryTypeOf = (row: TdCategoryRow): TdCategoryType => ('prompt' in row.data ? 'card-categories' : 'box-categories');

/** The text the category is named by (a card category's prompt, a box category's title). */
export const categoryText = (row: TdCategoryRow) => ('prompt' in row.data ? row.data.prompt : row.data.title);
export const categoryName = (row: TdCategoryRow) => categoryText(row) || row.data.key;

export const TD_STATUS_ICONS: Record<TdContentStatus, LucideIcon> = { draft: Pencil, ready: Send, approved: Check, archived: Archive };

/** How many cards or questions a category holds, in the words of its round; a dash while the number is not known. */
export const countLabel = (type: TdCategoryType, count: number | null) =>
  count === null ? '—' : type === 'card-categories' ? tn(count, '{count} card', '{count} cards') : tn(count, '{count} question', '{count} questions');

const LIVE = { status: 'draft,ready,approved' };

/** How many live cards or questions each category holds, counted from the rows themselves (the API has no count). */
export function useTdCategoryCounts() {
  const cards = useTdAllRows('cards', LIVE);
  const questions = useTdAllRows('box-questions', LIVE);
  const cardRows = cards.data;
  const questionRows = questions.data;
  return useMemo(() => {
    const tally = (loaded: { rows: Array<{ data: { categoryKey: string } }>; complete: boolean } | undefined) => {
      if (!loaded?.complete) return null;
      const counts = new Map<string, number>();
      for (const row of loaded.rows) counts.set(row.data.categoryKey, (counts.get(row.data.categoryKey) ?? 0) + 1);
      return counts;
    };
    const byType = { 'card-categories': tally(cardRows), 'box-categories': tally(questionRows) };
    /** null while the rows load (or when there are too many to count them all). */
    return (type: TdCategoryType, key: string): number | null => {
      const counts = byType[type];
      return counts ? (counts.get(key) ?? 0) : null;
    };
  }, [cardRows, questionRows]);
}
