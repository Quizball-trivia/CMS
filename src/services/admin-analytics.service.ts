import { apiClient } from './api-client';
import type { Audience, AudiencePeriod } from '@/types/admin-audience';

export const adminAnalyticsService = {
  getAudience(period: AudiencePeriod, signal?: AbortSignal): Promise<Audience> {
    return apiClient.get<Audience>('/admin/stats/audience', { period }, signal);
  },
};
