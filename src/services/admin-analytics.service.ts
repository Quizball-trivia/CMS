import { apiClient } from './api-client';
import type { AnalyticsOverview } from '@/types/admin-analytics';

export const adminAnalyticsService = {
  getOverview(signal?: AbortSignal): Promise<AnalyticsOverview> {
    return apiClient.get<AnalyticsOverview>('/admin/stats/analytics-overview', undefined, signal);
  },
};
