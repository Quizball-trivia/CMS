import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { harnessApi } from '@/lib/harness-api';
import type { HarnessUpdateSettingsRequest } from '@/types';

// The Content tab polls: agents work in the background.
export const HARNESS_REFETCH_MS = 10_000;

export const harnessKeys = {
  all: ['harness'] as const,
  overview: () => [...harnessKeys.all, 'overview'] as const,
};

export function useHarnessOverview() {
  return useQuery({ queryKey: harnessKeys.overview(), queryFn: () => harnessApi.overview(), refetchInterval: HARNESS_REFETCH_MS });
}

export function useUpdateHarnessSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: HarnessUpdateSettingsRequest) => harnessApi.updateSettings(body),
    onSettled: () => queryClient.invalidateQueries({ queryKey: harnessKeys.all }),
  });
}

export function useSetHarnessPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { key: string; value: unknown }) => harnessApi.setPolicy(v.key, v.value),
    onSettled: () => queryClient.invalidateQueries({ queryKey: harnessKeys.all }),
  });
}
