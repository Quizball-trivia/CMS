import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { questionsService } from '@/services';
import type {
  CreateQuestionRequest,
  UpdateQuestionRequest,
  ListQuestionsParams,
  UpdateQuestionStatusRequest,
} from '@/types';
import { logger } from '@/lib/logger';

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
    queryFn: async () => {
      logger.debug('questions', 'Fetching question by ID', { id });
      const result = await questionsService.getById(id);
      logger.info('questions', 'Question fetched', { id, type: result.type, payload: result.payload });
      return result;
    },
    enabled: !!id,
  });
}

export function useCreateQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateQuestionRequest) => {
      logger.info('questions', 'Creating question', { data });
      const result = await questionsService.create(data);
      logger.info('questions', 'Question created', { id: result.id, result });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: questionKeys.all });
    },
    onError: (error) => {
      logger.error('questions', 'Failed to create question', { error: error instanceof Error ? error.message : error });
    },
  });
}

export function useUpdateQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateQuestionRequest }) => {
      logger.info('questions', 'Updating question', { id, data });
      const result = await questionsService.update(id, data);
      logger.info('questions', 'Question updated', { id, result });
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: questionKeys.all });
      queryClient.invalidateQueries({ queryKey: questionKeys.detail(variables.id) });
    },
    onError: (error, variables) => {
      logger.error('questions', 'Failed to update question', { id: variables.id, error: error instanceof Error ? error.message : error });
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
