import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dailyChallengesService } from '@/services';
import type { DailyChallengeType, UpdateDailyChallengeConfigRequest } from '@/types';

export const dailyChallengeKeys = {
  all: ['daily-challenges'] as const,
  list: () => [...dailyChallengeKeys.all, 'list'] as const,
};

export function useDailyChallenges() {
  return useQuery({
    queryKey: dailyChallengeKeys.list(),
    queryFn: () => dailyChallengesService.list(),
  });
}

export function useUpdateDailyChallenge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ challengeType, data }: { challengeType: DailyChallengeType; data: UpdateDailyChallengeConfigRequest }) =>
      dailyChallengesService.update(challengeType, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dailyChallengeKeys.all });
    },
  });
}
