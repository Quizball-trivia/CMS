import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { campaignQuizPagesService } from '@/services';
import type { QuizPageHubOrderInput, QuizPageInput, QuizPageListFilters, QuizPageRetireInput } from '@/types';

export const quizPageKeys = {
  all: ['quiz-pages'] as const,
  list: (filters?: QuizPageListFilters) => [...quizPageKeys.all, 'list', filters] as const,
  detail: (slug: string) => [...quizPageKeys.all, 'detail', slug] as const,
  sets: () => [...quizPageKeys.all, 'question-sets'] as const,
  revisions: (slug: string) => [...quizPageKeys.all, 'revisions', slug] as const,
  searchConsole: () => [...quizPageKeys.all, 'search-console'] as const,
};

export function useQuizPages(filters?: QuizPageListFilters) {
  return useQuery({ queryKey: quizPageKeys.list(filters), queryFn: () => campaignQuizPagesService.list(filters) });
}

export function useQuizPage(slug?: string) {
  return useQuery({
    queryKey: quizPageKeys.detail(slug ?? ''),
    queryFn: () => campaignQuizPagesService.get(slug!),
    enabled: Boolean(slug),
  });
}

export function useQuizQuestionSets() {
  return useQuery({ queryKey: quizPageKeys.sets(), queryFn: campaignQuizPagesService.listQuestionSets });
}

export function useQuizPageRevisions(slug?: string) {
  return useQuery({
    queryKey: quizPageKeys.revisions(slug ?? ''),
    queryFn: () => campaignQuizPagesService.revisions(slug!),
    enabled: Boolean(slug),
  });
}

export function useQuizPageSearchConsole() {
  return useQuery({
    queryKey: quizPageKeys.searchConsole(),
    queryFn: campaignQuizPagesService.searchConsole,
    staleTime: 15 * 60_000,
  });
}

export function useCreateQuizPage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: QuizPageInput) => campaignQuizPagesService.create(input),
    onSuccess: () => client.invalidateQueries({ queryKey: quizPageKeys.all }),
  });
}

export function useUpdateQuizPage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ currentSlug, input }: { currentSlug: string; input: QuizPageInput }) =>
      campaignQuizPagesService.update(currentSlug, input),
    onSuccess: (page) => {
      client.invalidateQueries({ queryKey: quizPageKeys.all });
      client.setQueryData(quizPageKeys.detail(page.slug), page);
    },
  });
}

export function usePreviewQuizPage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: campaignQuizPagesService.preview,
    onSuccess: () => client.invalidateQueries({ queryKey: quizPageKeys.all }),
  });
}

export function usePublishQuizPage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, scheduledAt }: { slug: string; scheduledAt: string | null }) =>
      campaignQuizPagesService.publish(slug, scheduledAt),
    onSuccess: () => client.invalidateQueries({ queryKey: quizPageKeys.all }),
  });
}

export function useUnpublishQuizPage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, input }: { slug: string; input: QuizPageRetireInput }) =>
      campaignQuizPagesService.unpublish(slug, input),
    onSuccess: () => client.invalidateQueries({ queryKey: quizPageKeys.all }),
  });
}

export function useDeleteQuizPage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, input }: { slug: string; input: QuizPageRetireInput }) =>
      campaignQuizPagesService.remove(slug, input),
    onSuccess: () => client.invalidateQueries({ queryKey: quizPageKeys.all }),
  });
}

export function useRestoreQuizPageRevision() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, revisionId }: { slug: string; revisionId: number }) =>
      campaignQuizPagesService.restoreRevision(slug, revisionId),
    onSuccess: (page) => {
      client.invalidateQueries({ queryKey: quizPageKeys.all });
      client.setQueryData(quizPageKeys.detail(page.slug), page);
    },
  });
}

export function useUpdateQuizHubOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: QuizPageHubOrderInput) => campaignQuizPagesService.updateHubOrder(input),
    onSuccess: () => client.invalidateQueries({ queryKey: quizPageKeys.all }),
  });
}
