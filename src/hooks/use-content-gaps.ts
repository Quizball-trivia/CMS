import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { contentGapsApi } from '@/lib/content-gaps-api';
import type { ContentFixHumanTarget, ContentFixesListParams, ContentGapHumanTarget, ContentGapsListParams } from '@/types';

const REFETCH_MS = 60_000;
export const contentGapsKeys = {
  all: ['content-gaps'] as const,
  list: (p?: ContentGapsListParams) => ['content-gaps', 'list', p ?? {}] as const,
  summary: () => ['content-gaps', 'summary'] as const,
  fixes: (p?: ContentFixesListParams) => ['content-gaps', 'fixes', p ?? {}] as const,
};

export function useContentGaps(params?: ContentGapsListParams) {
  return useQuery({ queryKey: contentGapsKeys.list(params), queryFn: async () => (await contentGapsApi.list(params)).items, refetchInterval: REFETCH_MS });
}

export function useContentGapsSummary() {
  return useQuery({ queryKey: contentGapsKeys.summary(), queryFn: async () => (await contentGapsApi.summary()).items, refetchInterval: REFETCH_MS });
}

export function useContentFixes(params?: ContentFixesListParams) {
  return useQuery({ queryKey: contentGapsKeys.fixes(params), queryFn: async () => (await contentGapsApi.listFixes(params)).items, refetchInterval: REFETCH_MS });
}

export function useUpdateContentGap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; status: ContentGapHumanTarget; expectedRevision: number; reason: string }) => contentGapsApi.updateGap(v.id, v.status, v.expectedRevision, v.reason),
    onSettled: () => queryClient.invalidateQueries({ queryKey: contentGapsKeys.all }),
  });
}

export function useUpdateContentFix() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; status: ContentFixHumanTarget; expectedRevision: number; reason: string }) => contentGapsApi.updateFix(v.id, v.status, v.expectedRevision, v.reason),
    onSettled: () => queryClient.invalidateQueries({ queryKey: contentGapsKeys.all }),
  });
}
