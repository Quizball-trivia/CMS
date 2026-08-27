import { apiClient } from './api-client';
import type { RetentionJourneyDashboard } from '@/types/retention';

const BASE_PATH = '/admin/retention/reactivation';

export const retentionService = {
  getDashboard(signal?: AbortSignal): Promise<RetentionJourneyDashboard> {
    return apiClient.get<RetentionJourneyDashboard>(BASE_PATH, { cache_bust: Date.now() }, signal);
  },

  pause(): Promise<{ config: RetentionJourneyDashboard['config'] }> {
    return apiClient.post(`${BASE_PATH}/pause`, { confirmation: 'PAUSE' });
  },
};
