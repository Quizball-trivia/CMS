import type { Category, QuestionType } from '@/types';
import { getLocalizedText } from '@/lib/utils';

export const DAILY_CHALLENGE_PARENT_SLUG = 'daily-challenges';

export type DailyChallengeQuestionType = Extract<
  QuestionType,
  | 'mcq_single'
  | 'true_false'
  | 'countdown_list'
  | 'clue_chain'
  | 'put_in_order'
  | 'imposter_multi_select'
  | 'career_path'
  | 'high_low'
  | 'football_logic'
>;

export const DAILY_CHALLENGE_CATEGORY_TYPE_MAP: Record<string, DailyChallengeQuestionType> = {
  'daily-challenges-money-drop': 'mcq_single',
  'daily-challenges-true-false': 'true_false',
  'daily-challenges-countdown': 'countdown_list',
  'daily-challenges-clues': 'clue_chain',
  'daily-challenges-put-in-order': 'put_in_order',
  'daily-challenges-imposter': 'imposter_multi_select',
  'daily-challenges-career-path': 'career_path',
  'daily-challenges-high-low': 'high_low',
  'daily-challenges-football-logic': 'football_logic',
};

export const DAILY_CHALLENGE_CATEGORY_ALIASES: Record<string, DailyChallengeQuestionType> = {
  moneydrop: 'mcq_single',
  moneydropp: 'mcq_single',
  moneydropchallenge: 'mcq_single',
  truefalse: 'true_false',
  trueorfalse: 'true_false',
  clues: 'clue_chain',
  cluechain: 'clue_chain',
  clueschallenge: 'clue_chain',
  whoami: 'clue_chain',
  whoamichallenge: 'clue_chain',
  countdown: 'countdown_list',
  countdownchallenge: 'countdown_list',
  putinorder: 'put_in_order',
  puttingorder: 'put_in_order',
  imposter: 'imposter_multi_select',
  impostermultiselect: 'imposter_multi_select',
  careerpath: 'career_path',
  highlow: 'high_low',
  footballlogic: 'football_logic',
};

export function normalizeDailyChallengeCategoryKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function getDailyChallengeQuestionTypeForCategory(
  category: Pick<Category, 'slug' | 'name'> | undefined
): DailyChallengeQuestionType | undefined {
  if (!category || category.slug === DAILY_CHALLENGE_PARENT_SLUG) return undefined;

  const exactSlugMatch = DAILY_CHALLENGE_CATEGORY_TYPE_MAP[category.slug];
  if (exactSlugMatch) return exactSlugMatch;

  const normalizedSlug = normalizeDailyChallengeCategoryKey(
    category.slug.replace(/^daily-challenges-/, '')
  );
  const slugMatch = DAILY_CHALLENGE_CATEGORY_ALIASES[normalizedSlug];
  if (slugMatch) return slugMatch;

  const name = getLocalizedText(category.name, category.slug);
  return DAILY_CHALLENGE_CATEGORY_ALIASES[normalizeDailyChallengeCategoryKey(name)];
}
