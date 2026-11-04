import { t } from './i18n';

/** The daily games of the database's daily content (legacy since contract 12: the API keeps it, but no release
 *  takes it and the CMS no longer offers it). */
export type TdDailyGameKey = 'footballLogic' | 'putInOrder' | 'careerPath';

/** A day of a legacy daily game: one set of this many questions (Put in Order: rounds); the API checks the same
 *  (DAILY_DAY_SIZES in the TD contracts package). */
export const TD_DAILY_DAY_SIZES: Record<TdDailyGameKey, number> = { footballLogic: 10, putInOrder: 4, careerPath: 10 };

/** A daily game a release report, a release or the ops figures may name. Since contract 12 the dailies ship with the
 *  game's code (Stat Sniper, Put in Order, Career Path); Football Logic is only in releases and figures from before. */
export type TdReleaseDailyGame = 'statSniper' | 'footballLogic' | 'putInOrder' | 'careerPath';

/** In the order they are shown. */
export const TD_RELEASE_DAILY_GAMES: readonly TdReleaseDailyGame[] = ['statSniper', 'footballLogic', 'putInOrder', 'careerPath'];

export const TD_DAILY_GAME_LABELS: Record<TdReleaseDailyGame, string> = {
  statSniper: t('Stat Sniper'),
  footballLogic: t('Football Logic'),
  putInOrder: t('Put in Order'),
  careerPath: t('Career Path'),
};

/** The games a record by daily game holds (the contract's partial records), in the order they are shown. */
export function dailyEntries<V>(record: object): Array<[TdReleaseDailyGame, V]> {
  const byGame = record as Partial<Record<TdReleaseDailyGame, V>>;
  return TD_RELEASE_DAILY_GAMES.flatMap((game) => (byGame[game] === undefined ? [] : [[game, byGame[game]!] as [TdReleaseDailyGame, V]]));
}
