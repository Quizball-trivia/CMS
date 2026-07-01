import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsApi } from '@/lib/agents-api';
import { logger } from '@/lib/logger';
import { getErrorLogDetails } from '@/lib/error-feedback';
import { DEFAULT_PROMPT_TYPE } from '@/types';
import type {
  ListAgentJobsParams,
  SaveAgentPromptRequest,
  SpawnAgentJobRequest,
  UpdateAgentBudgetRequest,
  UpdateAgentQuestionTypeRequest,
  UpdateAgentScheduleRequest,
} from '@/types';

const LIVE_REFETCH_MS = 3000;

export const agentKeys = {
  all: ['agents'] as const,
  jobs: () => [...agentKeys.all, 'jobs'] as const,
  jobsList: (params?: ListAgentJobsParams) => [...agentKeys.jobs(), 'list', params] as const,
  job: (jobId: string) => [...agentKeys.jobs(), 'detail', jobId] as const,
  jobTasks: (jobId: string) => [...agentKeys.job(jobId), 'tasks'] as const,
  jobEvents: (jobId: string) => [...agentKeys.job(jobId), 'events'] as const,
  monitor: () => [...agentKeys.all, 'monitor'] as const,
  activity: () => [...agentKeys.all, 'activity'] as const,
  stats: () => [...agentKeys.all, 'stats'] as const,
  schedules: () => [...agentKeys.all, 'schedules'] as const,
  scheduleRuns: (id: string) => [...agentKeys.schedules(), id, 'runs'] as const,
  review: () => [...agentKeys.all, 'review'] as const,
  reviewCount: () => [...agentKeys.all, 'review', 'count'] as const,
  roster: () => [...agentKeys.all, 'roster'] as const,
  budget: () => [...agentKeys.all, 'budget'] as const,
  questionTypes: () => [...agentKeys.all, 'question-types'] as const,
  prompts: (type: string = DEFAULT_PROMPT_TYPE) =>
    [...agentKeys.all, 'prompts', type] as const,
  promptHistory: (role: string, type: string = DEFAULT_PROMPT_TYPE) =>
    [...agentKeys.prompts(type), 'history', role] as const,
};

export function useAgentJobs(params?: ListAgentJobsParams) {
  return useQuery({
    queryKey: agentKeys.jobsList(params),
    queryFn: async () => (await agentsApi.listJobs(params)).items,
    refetchInterval: LIVE_REFETCH_MS,
  });
}

export function useAgentJob(jobId: string, enabled = true) {
  return useQuery({
    queryKey: agentKeys.job(jobId),
    queryFn: () => agentsApi.getJob(jobId),
    enabled: enabled && !!jobId,
    refetchInterval: LIVE_REFETCH_MS,
  });
}

export function useJobTasks(jobId: string, enabled = true) {
  return useQuery({
    queryKey: agentKeys.jobTasks(jobId),
    queryFn: async () => (await agentsApi.listJobTasks(jobId)).items,
    enabled: enabled && !!jobId,
    refetchInterval: LIVE_REFETCH_MS,
  });
}

export function useJobEvents(jobId: string, enabled = true) {
  return useQuery({
    queryKey: agentKeys.jobEvents(jobId),
    queryFn: async () => (await agentsApi.listJobEvents(jobId)).items,
    enabled: enabled && !!jobId,
    refetchInterval: LIVE_REFETCH_MS,
  });
}

export function useAgentMonitor() {
  return useQuery({
    queryKey: agentKeys.monitor(),
    queryFn: () => agentsApi.getMonitor(),
    refetchInterval: LIVE_REFETCH_MS,
  });
}

export function useAgentActivity() {
  return useQuery({
    queryKey: agentKeys.activity(),
    queryFn: () => agentsApi.getActivity(),
    refetchInterval: LIVE_REFETCH_MS,
  });
}

export function useAgentStats() {
  return useQuery({
    queryKey: agentKeys.stats(),
    queryFn: () => agentsApi.getStats(),
    refetchInterval: 15000,
  });
}

export function useSchedules() {
  return useQuery({
    queryKey: agentKeys.schedules(),
    queryFn: async () => (await agentsApi.listSchedules()).items,
    refetchInterval: LIVE_REFETCH_MS,
  });
}

export function useScheduleRuns(id: string, enabled = true) {
  return useQuery({
    queryKey: agentKeys.scheduleRuns(id),
    queryFn: async () => (await agentsApi.getScheduleRuns(id)).items,
    enabled: enabled && !!id,
    refetchInterval: LIVE_REFETCH_MS,
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAgentScheduleRequest }) =>
      agentsApi.updateSchedule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.schedules() });
    },
    onError: (error) => {
      logger.error('agents', 'Failed to update schedule', getErrorLogDetails(error));
    },
  });
}

export function useRunScheduleNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agentsApi.runScheduleNow(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.jobs() });
      queryClient.invalidateQueries({ queryKey: agentKeys.schedules() });
      queryClient.invalidateQueries({ queryKey: agentKeys.scheduleRuns(id) });
    },
    onError: (error) => {
      logger.error('agents', 'Failed to run schedule now', getErrorLogDetails(error));
    },
  });
}

export function useAgentRoster() {
  return useQuery({
    queryKey: agentKeys.roster(),
    queryFn: () => agentsApi.getRoster(),
    refetchInterval: LIVE_REFETCH_MS,
  });
}

// ── Review queue ──
export function useReviewQueue() {
  return useQuery({
    queryKey: agentKeys.review(),
    queryFn: () => agentsApi.getReviewQueue(),
    refetchInterval: LIVE_REFETCH_MS,
  });
}

export function useReviewCount() {
  return useQuery({
    queryKey: agentKeys.reviewCount(),
    queryFn: () => agentsApi.getReviewCount(),
    refetchInterval: 15000,
  });
}

export function useApproveQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (questionId: string) => agentsApi.approveQuestion(questionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.review() });
      queryClient.invalidateQueries({ queryKey: agentKeys.reviewCount() });
    },
    onError: (error) => {
      logger.error('agents', 'Failed to approve question', getErrorLogDetails(error));
    },
  });
}

export function useRejectQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (questionId: string) => agentsApi.rejectQuestion(questionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.review() });
      queryClient.invalidateQueries({ queryKey: agentKeys.reviewCount() });
    },
    onError: (error) => {
      logger.error('agents', 'Failed to reject question', getErrorLogDetails(error));
    },
  });
}

export function useAgentBudget() {
  return useQuery({
    queryKey: agentKeys.budget(),
    queryFn: () => agentsApi.getBudget(),
    refetchInterval: LIVE_REFETCH_MS,
  });
}

export function useQuestionTypes() {
  return useQuery({
    queryKey: agentKeys.questionTypes(),
    queryFn: async () => (await agentsApi.listQuestionTypes()).items,
  });
}

export function useAgentPrompts(type?: string) {
  return useQuery({
    queryKey: agentKeys.prompts(type ?? DEFAULT_PROMPT_TYPE),
    queryFn: async () => (await agentsApi.listPrompts(type)).items,
  });
}

export function usePromptHistory(role: string, type?: string, enabled = true) {
  return useQuery({
    queryKey: agentKeys.promptHistory(role, type ?? DEFAULT_PROMPT_TYPE),
    queryFn: async () => (await agentsApi.getPromptHistory(role, type)).items,
    enabled: enabled && !!role,
  });
}

export function useSpawnJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SpawnAgentJobRequest) => agentsApi.spawnJob(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.jobs() });
      queryClient.invalidateQueries({ queryKey: agentKeys.monitor() });
    },
    onError: (error) => {
      logger.error('agents', 'Failed to spawn agent job', getErrorLogDetails(error));
    },
  });
}

export function useCancelJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => agentsApi.cancelJob(jobId),
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.jobs() });
      queryClient.invalidateQueries({ queryKey: agentKeys.job(jobId) });
      queryClient.invalidateQueries({ queryKey: agentKeys.monitor() });
    },
    onError: (error, jobId) => {
      logger.error('agents', 'Failed to cancel agent job', { jobId, ...getErrorLogDetails(error) });
    },
  });
}

export function useRetryTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId }: { taskId: string; jobId: string }) => agentsApi.retryTask(taskId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.jobTasks(variables.jobId) });
      queryClient.invalidateQueries({ queryKey: agentKeys.job(variables.jobId) });
    },
    onError: (error, variables) => {
      logger.error('agents', 'Failed to retry agent task', {
        taskId: variables.taskId,
        ...getErrorLogDetails(error),
      });
    },
  });
}

export function useSetBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateAgentBudgetRequest) => agentsApi.setBudget(data),
    onSuccess: (budget) => {
      queryClient.setQueryData(agentKeys.budget(), budget);
    },
    onError: (error) => {
      logger.error('agents', 'Failed to update agent budget', getErrorLogDetails(error));
    },
  });
}

export function useUpdateQuestionType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ type, data }: { type: string; data: UpdateAgentQuestionTypeRequest }) =>
      agentsApi.updateQuestionType(type, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.questionTypes() });
    },
    onError: (error, variables) => {
      logger.error('agents', 'Failed to update question type', {
        type: variables.type,
        ...getErrorLogDetails(error),
      });
    },
  });
}

export function useSavePrompt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ role, data }: { role: string; data: SaveAgentPromptRequest }) =>
      agentsApi.savePrompt(role, data),
    onSuccess: (_, variables) => {
      const type = variables.data.type ?? DEFAULT_PROMPT_TYPE;
      queryClient.invalidateQueries({ queryKey: agentKeys.prompts(type) });
      queryClient.invalidateQueries({ queryKey: agentKeys.promptHistory(variables.role, type) });
    },
    onError: (error, variables) => {
      logger.error('agents', 'Failed to save agent prompt', {
        role: variables.role,
        ...getErrorLogDetails(error),
      });
    },
  });
}

export function useActivatePromptVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ promptId }: { promptId: string; role: string; type?: string }) =>
      agentsApi.activatePromptVersion(promptId),
    onSuccess: (_, variables) => {
      const type = variables.type ?? DEFAULT_PROMPT_TYPE;
      queryClient.invalidateQueries({ queryKey: agentKeys.prompts(type) });
      queryClient.invalidateQueries({ queryKey: agentKeys.promptHistory(variables.role, type) });
    },
    onError: (error, variables) => {
      logger.error('agents', 'Failed to activate agent prompt version', {
        promptId: variables.promptId,
        ...getErrorLogDetails(error),
      });
    },
  });
}
