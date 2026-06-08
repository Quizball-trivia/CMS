import type { components, paths } from './api.generated';

export type AdminUsersListResponse = components['schemas']['AdminUsersListResponse'];
export type AdminUserListItem = AdminUsersListResponse['items'][number];
export type AdminProgressionResult = components['schemas']['AdminProgressionResult'];
export type LeaderboardResetResponse = components['schemas']['LeaderboardResetResponse'];

export type AdminUsersListQuery =
  paths['/api/v1/admin/users']['get']['parameters']['query'];

export type AdminSetProgressionBody = NonNullable<
  paths['/api/v1/admin/users/{userId}/progression']['patch']['requestBody']
>['content']['application/json'];

export type LeaderboardResetBody = NonNullable<
  paths['/api/v1/admin/leaderboard/reset']['post']['requestBody']
>['content']['application/json'];

/** Which currency/stat a single edit row targets. */
export type AdminEditField = 'xp' | 'rp' | 'coins' | 'tickets';

/** How a single edit applies: set an absolute value or grant a delta. */
export type AdminEditMode = 'set' | 'delta';
