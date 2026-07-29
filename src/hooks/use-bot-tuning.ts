import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { botTuningService } from '@/services';
import type { BotRosterQuery, PatchBotRequest, UpdateBotTuningRequest } from '@/types';
import { logger } from '@/lib/logger';
import { getErrorLogDetails } from '@/lib/error-feedback';

export const botTuningKeys = {
  all: ['bot-tuning'] as const,
  params: () => [...botTuningKeys.all, 'params'] as const,
  roster: (query: BotRosterQuery) => [...botTuningKeys.all, 'roster', query] as const,
  history: (botUserId: string) => [...botTuningKeys.all, 'history', botUserId] as const,
};

export function useBotTuning() {
  return useQuery({
    queryKey: botTuningKeys.params(),
    queryFn: () => botTuningService.getTuning(),
  });
}

export function useBotRoster(query: BotRosterQuery) {
  return useQuery({
    queryKey: botTuningKeys.roster(query),
    queryFn: () => botTuningService.getRoster(query),
    // Keeps the previous page on screen while the next one loads, so paging
    // and sorting do not flash an empty table.
    placeholderData: keepPreviousData,
  });
}

export function useUpdateBotTuning() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateBotTuningRequest) => botTuningService.updateTuning(data),
    onSuccess: (response) => {
      // The PUT returns the committed state, so seed the cache with it rather
      // than refetching.
      queryClient.setQueryData(botTuningKeys.params(), response);
    },
    onError: (error) => {
      logger.error('bot-tuning', 'Failed to update bot tuning', getErrorLogDetails(error));
    },
  });
}

export function useSetBotFrozen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      botUserId,
      frozen,
      reason,
    }: {
      botUserId: string;
      frozen: boolean;
      reason?: string;
    }) => botTuningService.setFrozen(botUserId, frozen, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: botTuningKeys.all });
    },
    onError: (error) => {
      logger.error('bot-tuning', 'Failed to change bot freeze state', getErrorLogDetails(error));
    },
  });
}

export function useEditBot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ botUserId, data }: { botUserId: string; data: PatchBotRequest }) =>
      botTuningService.patchBot(botUserId, data),
    onSuccess: () => {
      // An edit can move rp/nickname/dailyCap/baseSkill, all of which the roster
      // renders and sorts by, so refetch rather than patching the cached row.
      queryClient.invalidateQueries({ queryKey: botTuningKeys.all });
    },
    onError: (error) => {
      logger.error('bot-tuning', 'Failed to edit bot', getErrorLogDetails(error));
    },
  });
}

export function useZeroGovernorOffsets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) => botTuningService.zeroGovernorOffsets(reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: botTuningKeys.all });
    },
    onError: (error) => {
      logger.error('bot-tuning', 'Failed to zero governor offsets', getErrorLogDetails(error));
    },
  });
}
