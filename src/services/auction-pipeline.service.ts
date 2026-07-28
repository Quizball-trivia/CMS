import { apiClient } from './api-client';
import type { AuctionPipelineStats } from '@/types/auction-pipeline';

const BASE_PATH = '/admin/auction-pipeline';

export const auctionPipelineService = {
  async getStats(signal?: AbortSignal): Promise<AuctionPipelineStats> {
    return apiClient.get<AuctionPipelineStats>(
      `${BASE_PATH}/stats`,
      { cache_bust: Date.now() },
      signal
    );
  },
};
