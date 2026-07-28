import { apiClient } from './api-client';
import type {
  AuctionPipelinePrompt,
  AuctionPipelinePromptKey,
  AuctionPipelineRequeueRequest,
  AuctionPipelineStats,
  AuctionPipelineWorkers,
} from '@/types/auction-pipeline';

const BASE_PATH = '/admin/auction-pipeline';

export const auctionPipelineService = {
  async getStats(signal?: AbortSignal): Promise<AuctionPipelineStats> {
    return apiClient.get<AuctionPipelineStats>(
      `${BASE_PATH}/stats`,
      { cache_bust: Date.now() },
      signal
    );
  },

  async getWorkers(signal?: AbortSignal): Promise<AuctionPipelineWorkers> {
    return apiClient.get<AuctionPipelineWorkers>(
      `${BASE_PATH}/workers`,
      { cache_bust: Date.now() },
      signal
    );
  },

  async listPrompts(signal?: AbortSignal): Promise<{ items: AuctionPipelinePrompt[] }> {
    return apiClient.get<{ items: AuctionPipelinePrompt[] }>(
      `${BASE_PATH}/prompts`,
      undefined,
      signal
    );
  },

  async savePrompt(key: AuctionPipelinePromptKey, text: string): Promise<AuctionPipelinePrompt> {
    return apiClient.put<AuctionPipelinePrompt>(`${BASE_PATH}/prompts/${key}`, { text });
  },

  async requeue(data: AuctionPipelineRequeueRequest): Promise<{ requeued: number }> {
    return apiClient.post<{ requeued: number }>(`${BASE_PATH}/requeue`, data);
  },
};
