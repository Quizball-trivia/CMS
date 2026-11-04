import { apiClient } from './api-client';
import type { AnalyticsOverview } from '@/types/admin-analytics';
import type { Audience, AudiencePeriod } from '@/types/admin-audience';

export const adminAnalyticsService = {
  getOverview(signal?: AbortSignal): Promise<AnalyticsOverview> {
    return apiClient.get<AnalyticsOverview>('/admin/stats/analytics-overview', undefined, signal);
  },
  getAudience(period: AudiencePeriod, signal?: AbortSignal): Promise<Audience> {
    return apiClient.get<Audience>('/admin/stats/audience', { period }, signal);
  },
};
