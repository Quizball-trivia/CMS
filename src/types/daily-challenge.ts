import type { components, paths } from './api.generated';
import type { I18nField } from './category';

export type DailyChallengeSummary = components['schemas']['DailyChallengeMetadata'];
export type DailyChallengeType = DailyChallengeSummary['challengeType'];
export type DailyChallengeIconToken = DailyChallengeSummary['iconToken'];

type GeneratedAdminDailyChallengeConfig =
  components['schemas']['AdminDailyChallengeConfigResponse'];

export interface AdminDailyChallengeCategoryOption {
  id: string;
  slug: string;
  name: I18nField;
  questionCount: number;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
}

export interface AdminDailyChallengeConfig extends Omit<GeneratedAdminDailyChallengeConfig, 'availableCategories'> {
  availableCategories: AdminDailyChallengeCategoryOption[];
}

export interface ListAdminDailyChallengesResponse {
  items: AdminDailyChallengeConfig[];
}

export type UpdateDailyChallengeConfigRequest =
  paths['/api/v1/admin/daily-challenges/{challengeType}']['put']['requestBody']['content']['application/json'];

export type DailyChallengeSettings = AdminDailyChallengeConfig['settings'];
export type MoneyDropSettings = Extract<DailyChallengeSettings, { questionCount: number; secondsPerQuestion: number; startingMoney: number }>;
export type TrueFalseSettings = Extract<DailyChallengeSettings, { challengeType: 'trueFalse' }>;
export type CountdownSettings = Extract<DailyChallengeSettings, { roundCount: number; secondsPerRound: number }>;
export type CluesSettings = Extract<DailyChallengeSettings, { questionCount: number; secondsPerClueStep: number }>;
export type PutInOrderSettings = Extract<DailyChallengeSettings, { roundCount: number; itemsPerRound: number }>;
export type ImposterSettings = Extract<DailyChallengeSettings, { challengeType: 'imposter' }>;
export type CareerPathSettings = Extract<DailyChallengeSettings, { challengeType: 'careerPath' }>;
export type HighLowSettings = Extract<DailyChallengeSettings, { challengeType: 'highLow' }>;
export type FootballLogicSettings = Extract<DailyChallengeSettings, { challengeType: 'footballLogic' }>;
