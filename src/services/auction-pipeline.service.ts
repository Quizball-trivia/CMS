import { apiClient } from './api-client';
import type {
  AuctionPipelinePrompt,
  AuctionPipelinePromptKey,
  AuctionPipelinePromptMode,
  AuctionPipelinePromptsResponse,
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

  async listPrompts(signal?: AbortSignal): Promise<AuctionPipelinePromptsResponse> {
    return apiClient.get<AuctionPipelinePromptsResponse>(
      `${BASE_PATH}/prompts`,
      undefined,
      signal
    );
  },

  async savePrompt(
    key: AuctionPipelinePromptKey,
    text: string,
    mode: AuctionPipelinePromptMode
  ): Promise<AuctionPipelinePrompt> {
    return apiClient.put<AuctionPipelinePrompt>(`${BASE_PATH}/prompts/${key}`, { text, mode });
  },

  async resetPrompt(key: AuctionPipelinePromptKey): Promise<{ reset: boolean }> {
    return apiClient.delete<{ reset: boolean }>(`${BASE_PATH}/prompts/${key}`);
  },

  async requeue(data: AuctionPipelineRequeueRequest): Promise<{ requeued: number }> {
    const hasTaskIds = (data.taskIds?.length ?? 0) > 0;
    const hasFilter = data.filter !== undefined;
    if (hasTaskIds === hasFilter) {
      throw new Error('Requeue requires either taskIds or a filter, not both or neither');
    }
    return apiClient.post<{ requeued: number }>(`${BASE_PATH}/requeue`, data);
  },
};
