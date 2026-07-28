import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { auctionPipelineService } from '@/services';
import { logger } from '@/lib/logger';
import { getErrorLogDetails } from '@/lib/error-feedback';
import type {
  AuctionPipelinePromptKey,
  AuctionPipelineRequeueRequest,
} from '@/types/auction-pipeline';

const LIVE_REFETCH_MS = 3000;
const STATS_REFETCH_MS = 15000;

export const auctionPipelineKeys = {
  all: ['auction', 'pipeline'] as const,
  stats: () => [...auctionPipelineKeys.all, 'stats'] as const,
  workers: () => [...auctionPipelineKeys.all, 'workers'] as const,
  prompts: () => [...auctionPipelineKeys.all, 'prompts'] as const,
};

export function useAuctionPipelineStats() {
  return useQuery({
    queryKey: auctionPipelineKeys.stats(),
    queryFn: ({ signal }) => auctionPipelineService.getStats(signal),
    refetchInterval: STATS_REFETCH_MS,
  });
}

export function useAuctionPipelineWorkers() {
  return useQuery({
    queryKey: auctionPipelineKeys.workers(),
    queryFn: ({ signal }) => auctionPipelineService.getWorkers(signal),
    refetchInterval: LIVE_REFETCH_MS,
  });
}

/** Prompts deliberately do not poll — a refetch would stomp an in-progress edit. */
export function useAuctionPipelinePrompts() {
  return useQuery({
    queryKey: auctionPipelineKeys.prompts(),
    queryFn: ({ signal }) => auctionPipelineService.listPrompts(signal),
  });
}

export function useSaveAuctionPipelinePrompt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ key, text }: { key: AuctionPipelinePromptKey; text: string }) =>
      auctionPipelineService.savePrompt(key, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: auctionPipelineKeys.prompts() });
    },
    onError: (error, variables) => {
      logger.error('auction', 'Failed to save pipeline prompt', {
        key: variables.key,
        ...getErrorLogDetails(error),
      });
    },
  });
}

export function useRequeueAuctionPipelineTasks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AuctionPipelineRequeueRequest) => auctionPipelineService.requeue(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: auctionPipelineKeys.stats() });
      queryClient.invalidateQueries({ queryKey: auctionPipelineKeys.workers() });
    },
    onError: (error, variables) => {
      logger.error('auction', 'Failed to requeue pipeline tasks', {
        filter: variables.filter,
        ...getErrorLogDetails(error),
      });
    },
  });
}
