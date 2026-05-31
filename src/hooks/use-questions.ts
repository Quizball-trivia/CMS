import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { questionsService } from '@/services';
import type {
  CreateQuestionRequest,
  UpdateQuestionRequest,
  ListQuestionsParams,
  UpdateQuestionStatusRequest,
  BulkCreateQuestionsRequest,
  FindDuplicatesParams,
  CheckDuplicatesRequest,
} from '@/types';
import { logger } from '@/lib/logger';
import { getErrorLogDetails } from '@/lib/error-feedback';
import { toast } from 'sonner';

export const questionKeys = {
  all: ['questions'] as const,
  lists: () => [...questionKeys.all, 'list'] as const,
  list: (params?: ListQuestionsParams) => [...questionKeys.lists(), params] as const,
  details: () => [...questionKeys.all, 'detail'] as const,
  detail: (id: string) => [...questionKeys.details(), id] as const,
  duplicates: (params?: FindDuplicatesParams) => [...questionKeys.all, 'duplicates', params] as const,
};

export function useQuestions(params?: ListQuestionsParams) {
  return useQuery({
    queryKey: questionKeys.list(params),
    queryFn: () => questionsService.list(params),
  });
}

export function useQuestion(id: string, enabled = true) {
  return useQuery({
    queryKey: questionKeys.detail(id),
    queryFn: async () => {
      logger.debug('questions', 'Fetching question by ID', { id });
      const result = await questionsService.getById(id);
      logger.info('questions', 'Question fetched', { id, type: result.type, payload: result.payload });
      return result;
    },
    enabled: enabled && !!id,
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
      logger.error('questions', 'Failed to create question', getErrorLogDetails(error));
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
      logger.error('questions', 'Failed to update question', { id: variables.id, ...getErrorLogDetails(error) });
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
    onError: (error, id) => {
      logger.error('questions', 'Failed to delete question', { id, ...getErrorLogDetails(error) });
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
    onError: (error, variables) => {
      logger.error('questions', 'Failed to update question status', {
        id: variables.id,
        nextStatus: variables.data.status,
        ...getErrorLogDetails(error),
      });
    },
  });
}

export function useBulkCreateQuestions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BulkCreateQuestionsRequest) => {
      logger.info('questions', 'Starting bulk create', { count: data.questions.length });
      return questionsService.bulkCreate(data);
    },
    onSuccess: (result) => {
      // Invalidate all question queries
      queryClient.invalidateQueries({ queryKey: questionKeys.all });

      // Show success toast
      if (result.failed === 0) {
        toast.success(`Successfully created ${result.successful} questions`);
      } else {
        toast.warning(
          `Created ${result.successful} questions, ${result.failed} failed`,
          {
            description: 'Check the upload results for details',
          }
        );
      }

      logger.info('questions', 'Bulk create completed', {
        successful: result.successful,
        failed: result.failed,
        total: result.total,
      });
    },
    onError: (error) => {
      toast.error('Bulk upload failed. Please try again.');
      logger.error('questions', 'Failed to bulk create questions', getErrorLogDetails(error));
    },
  });
}

export function useDuplicateQuestions(
  params?: FindDuplicatesParams,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: questionKeys.duplicates(params),
    queryFn: () => questionsService.findDuplicates(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    enabled: options?.enabled ?? true,
  });
}

export function useCheckDuplicates() {
  return useMutation({
    mutationFn: (data: CheckDuplicatesRequest & { onProgress?: (checked: number, total: number) => void }) =>
      questionsService.checkDuplicates(data, data.onProgress),
    onError: (error) => {
      logger.error('questions', 'Failed to check duplicates', getErrorLogDetails(error));
    },
  });
}
