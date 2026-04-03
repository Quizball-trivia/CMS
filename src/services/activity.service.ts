import { apiClient } from './api-client';
import type {
  ActivityResponse,
  ActivityUsersResponse,
  CategoryBreakdownResponse,
  RecentActivityResponse,
} from '@/types';

export const activityService = {
  async getActivity(params: { from: string; to: string; user_id: string }): Promise<ActivityResponse> {
    return apiClient.get<ActivityResponse>('/admin/activity', params);
  },

  async getUsers(): Promise<ActivityUsersResponse> {
    return apiClient.get<ActivityUsersResponse>('/admin/activity/users');
  },

  async getByCategory(params: { user_id: string; from: string; to: string }): Promise<CategoryBreakdownResponse> {
    return apiClient.get<CategoryBreakdownResponse>('/admin/activity/by-category', params);
  },

  async getRecent(userId: string, limit = 50): Promise<RecentActivityResponse> {
    return apiClient.get<RecentActivityResponse>('/admin/activity/recent', { user_id: userId, limit });
  },
};
