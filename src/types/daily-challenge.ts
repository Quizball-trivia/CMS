import type { components, paths } from './api.generated';

export type DailyChallengeSummary = components['schemas']['DailyChallengeMetadata'];
export type DailyChallengeType = DailyChallengeSummary['challengeType'];
export type DailyChallengeIconToken = DailyChallengeSummary['iconToken'];

export type AdminDailyChallengeConfig =
  components['schemas']['AdminDailyChallengeConfigResponse'];

export type ListAdminDailyChallengesResponse =
  paths['/api/v1/admin/daily-challenges']['get']['responses']['200']['content']['application/json'];

export type UpdateDailyChallengeConfigRequest =
  paths['/api/v1/admin/daily-challenges/{challengeType}']['put']['requestBody']['content']['application/json'];

export type DailyChallengeSettings = AdminDailyChallengeConfig['settings'];
export type MoneyDropSettings = Extract<DailyChallengeSettings, { questionCount: number; secondsPerQuestion: number; startingMoney: number }>;
export type FootballJeopardySettings = Extract<DailyChallengeSettings, { pickCount: number }>;
export type CountdownSettings = Extract<DailyChallengeSettings, { roundCount: number; secondsPerRound: number }>;
export type CluesSettings = Extract<DailyChallengeSettings, { questionCount: number; secondsPerClueStep: number }>;
export type PutInOrderSettings = Extract<DailyChallengeSettings, { roundCount: number; itemsPerRound: number }>;
