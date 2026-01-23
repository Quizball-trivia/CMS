import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { questionsService } from '@/services';
import type {
  CreateQuestionRequest,
  UpdateQuestionRequest,
  ListQuestionsParams,
  UpdateQuestionStatusRequest,
} from '@/types';

export const questionKeys = {
  all: ['questions'] as const,
  lists: () => [...questionKeys.all, 'list'] as const,
  list: (params?: ListQuestionsParams) => [...questionKeys.lists(), params] as const,
  details: () => [...questionKeys.all, 'detail'] as const,
  detail: (id: string) => [...questionKeys.details(), id] as const,
};

export function useQuestions(params?: ListQuestionsParams) {
  return useQuery({
    queryKey: questionKeys.list(params),
    queryFn: () => questionsService.list(params),
  });
}

export function useQuestion(id: string) {
  return useQuery({
    queryKey: questionKeys.detail(id),
    queryFn: () => questionsService.getById(id),
    enabled: !!id,
  });
}

export function useCreateQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateQuestionRequest) => questionsService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: questionKeys.all });
    },
  });
}

export function useUpdateQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateQuestionRequest }) =>
      questionsService.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: questionKeys.all });
      queryClient.invalidateQueries({ queryKey: questionKeys.detail(variables.id) });
    },
  });
}

export function useDeleteQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => questionsService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: questionKeys.all });
    },
  });
}

export function useUpdateQuestionStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateQuestionStatusRequest }) =>
      questionsService.updateStatus(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: questionKeys.all });
      queryClient.invalidateQueries({ queryKey: questionKeys.detail(variables.id) });
    },
  });
}
