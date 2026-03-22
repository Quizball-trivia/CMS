import { apiClient } from './api-client';
import type {
  AdminDailyChallengeConfig,
  ListAdminDailyChallengesResponse,
  DailyChallengeType,
  UpdateDailyChallengeConfigRequest,
} from '@/types';

export const dailyChallengesService = {
  async list(): Promise<AdminDailyChallengeConfig[]> {
    const response = await apiClient.get<ListAdminDailyChallengesResponse>('/admin/daily-challenges');
    return response.items;
  },

  async update(
    challengeType: DailyChallengeType,
    data: UpdateDailyChallengeConfigRequest
  ): Promise<AdminDailyChallengeConfig> {
    return apiClient.put<AdminDailyChallengeConfig>(`/admin/daily-challenges/${challengeType}`, data);
  },
};
