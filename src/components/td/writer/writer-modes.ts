import { TD_WRITER_REJECT_STAGES, type TdWriterDifficulty, type TdWriterMode, type TdWriterOverview, type TdWriterRejectStage, type TdWriterReleaseState } from '@/lib/td/admin-api';
import { t } from '@/lib/td/i18n';

/** Every mode, in the order of a match (practice last): the Questions page's own names. */
export const WRITER_MODE_LABEL: Record<TdWriterMode, string> = {
  cards: t('Round I · ბარათონი'),
  'whoami-subjects': t('Round II · გამარჯობა'),
  'box-questions': t('Round III · პაპა კარლოს ყუთი'),
  'penalty-questions': t('Penalties'),
  'practice-questions': t('Practice · ივარჯიშე'),
};
export const WRITER_MODES = Object.keys(WRITER_MODE_LABEL) as TdWriterMode[];

/** Each mode's count of drafts waiting, in the overview. */
export const WRITER_TO_REVIEW: Record<TdWriterMode, keyof TdWriterOverview['toReview']> = {
  cards: 'cards',
  'whoami-subjects': 'whoamiSubjects',
  'box-questions': 'boxQuestions',
  'penalty-questions': 'penaltyQuestions',
  'practice-questions': 'practiceQuestions',
};

/** Each mode's count of rows its jobs published on their own (still in the game). */
export const WRITER_AUTO_COUNT: Record<TdWriterMode, keyof TdWriterOverview['autoPublished']> = WRITER_TO_REVIEW;

export const writerToReviewTotal = (overview: Pick<TdWriterOverview, 'toReview'>) => WRITER_MODES.reduce((sum, mode) => sum + overview.toReview[WRITER_TO_REVIEW[mode]], 0);

export const WRITER_DIFFICULTIES: readonly TdWriterDifficulty[] = ['house', 'easy', 'hard'];
export const WRITER_DIFFICULTY_LABEL: Record<TdWriterDifficulty, string> = {
  house: t('Betsson’s style, a little easier'),
  easy: t('Easy'),
  hard: t('Hard'),
};

/** Why the AI turned a candidate away, by its check. */
export const WRITER_STAGE_LABEL: Record<TdWriterRejectStage, string> = {
  plan: t('Planning'),
  format: t('Format'),
  duplicate: t('Duplicate answer'),
  same_fact: t('Same fact'),
  giveaway: t('Gives the answer away'),
  fact: t('Fact check'),
  judge: t('Judge'),
  too_easy: t('Too easy for the level'),
  category: t('Category'),
  api: t('Server check'),
};

const stageText = (text: string) =>
  text.replace(/\b([a-z_]+) (\d+)\b/g, (whole, stage: string, n: string) =>
    (TD_WRITER_REJECT_STAGES as readonly string[]).includes(stage) ? `${WRITER_STAGE_LABEL[stage as TdWriterRejectStage]} ${n}` : whole,
  );

const STOP = /^(no_subjects|turned_away|out_of_rounds|category_gone|plan_limit|error):\s*([\s\S]*)$/;

/** Why a job made fewer than asked, as the agent sends it (`code: English text`), said in Georgian. An error keeps its
 *  own words after a Georgian lead; anything else is shown as it came. */
export function writerStopReasonText(reason: string): string {
  const text = reason.trim();
  const stop = STOP.exec(text);
  if (!stop) return t('Stopped: {reason}', { reason: text });
  const detail = stop[2]!.trim();
  switch (stop[1]) {
    case 'no_subjects':
      return t('Ran out of new answers: twice in a row, nothing the AI wrote passed the checks');
    case 'turned_away': {
      const away = /^(\d+) candidates did not pass(?: \((.*)\))?/.exec(detail);
      if (!away) return t('Too many candidates were turned away');
      return away[2]
        ? t('Too many turned away: {n} did not pass the checks ({stages})', { n: away[1]!, stages: stageText(away[2]) })
        : t('Too many turned away: {n} did not pass the checks', { n: away[1]! });
    }
    case 'out_of_rounds': {
      const rounds = /in (\d+) rounds/.exec(detail);
      return rounds ? t('Ran out of rounds ({n}): the AI wrote too few questions', { n: rounds[1]! }) : t('Ran out of rounds: the AI wrote too few questions');
    }
    case 'category_gone':
      return t('The job’s category was archived: it takes no more questions');
    case 'plan_limit':
      return t('The AI subscription’s limit was reached: the job stopped');
    default:
      return detail ? t('Stopped on an error: {detail}', { detail }) : t('Stopped on an error');
  }
}

/** Where the release after an auto-publishing job stands. */
export const WRITER_RELEASE_LABEL: Record<TdWriterReleaseState, string> = {
  pending: t('The release waits for another publish to end'),
  started: t('The release is going out'),
  published: t('Released: players have them'),
  unchanged: t('Nothing new to release: players already have them'),
  held: t('Not released automatically: other changes wait to be published too. Publish them from the Releases page.'),
  failed: t('The release did not go out: the questions stay approved'),
};

const PUBLISH_ERROR = /^(the release check refused it|the release did not start|auto-approve failed|release_held|auto_publish_skipped):\s*([\s\S]*)$/;

/** Why a job's release did not go out (the API's English lead, its details as they came), said in Georgian. */
export function writerPublishErrorText(error: string): string {
  const found = PUBLISH_ERROR.exec(error.trim());
  if (!found) return t('Not published: {reason}', { reason: error.trim() });
  const reason = found[2]!.trim();
  switch (found[1]) {
    case 'the release check refused it':
      return t('The release check refused it: {reason}', { reason });
    case 'the release did not start':
      return t('The release did not start: {reason}', { reason });
    case 'auto_publish_skipped':
      return t('Nothing was published automatically: someone changed questions of this round while the job ran, so all of its questions wait for review.');
    case 'release_held':
      return t('Other changes wait to be published with them: a member publishes from the Releases page.');
    default:
      return t('Automatic approval failed; the questions stay drafts: {reason}', { reason });
  }
}

/** The overview's polling, shared by the page and the sidebar's count. */
export const WRITER_POLL_MS = 5_000;
export const WRITER_IDLE_POLL_MS = 30_000;
