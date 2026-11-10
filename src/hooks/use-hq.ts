import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { hqApi } from '@/lib/hq-api';
import { logger } from '@/lib/logger';
import { getErrorLogDetails } from '@/lib/error-feedback';
import type {
  HqAcceptProposalRequest,
  HqGoalStatus,
  HqGoalUpdateRequest,
  HqGoalWriteRequest,
  HqCreateMemberRequest,
  HqCreateScheduleRequest,
  HqCreateTaskRequest,
  HqListEventsParams,
  HqListRunsParams,
  HqListTasksParams,
  HqPostMessageRequest,
  HqUpdateMemberRequest,
  HqUpdateScheduleRequest,
  HqUpdateSettingsRequest,
  HqUpdateTaskRequest,
} from '@/types';

// HQ views are "live": agents work in the background, so poll. Things that
// change only when a person edits them (members, schedules, settings) or that
// are expensive to compute (standup, overview) poll slower; every mutation
// invalidates the affected queries, so edits still show at once.
export const HQ_LIVE_REFETCH_MS = 5000;
export const HQ_SLOW_REFETCH_MS = 30_000;
const EVENTS_PAGE_SIZE = 100;

export const hqKeys = {
  all: ['hq'] as const,
  overview: () => [...hqKeys.all, 'overview'] as const,
  members: () => [...hqKeys.all, 'members'] as const,
  membersList: (includeArchived: boolean) => [...hqKeys.members(), 'list', includeArchived] as const,
  member: (id: string) => [...hqKeys.members(), 'detail', id] as const,
  tasks: () => [...hqKeys.all, 'tasks'] as const,
  // Optional params are omitted (not `undefined`) so the parent key is a prefix of every variant.
  tasksList: (params?: HqListTasksParams) => [...hqKeys.tasks(), 'list', ...(params ? [params] : [])] as const,
  task: (id: string) => [...hqKeys.tasks(), 'detail', id] as const,
  runs: () => [...hqKeys.all, 'runs'] as const,
  runsList: (params?: HqListRunsParams) => [...hqKeys.runs(), 'list', ...(params ? [params] : [])] as const,
  run: (id: string) => [...hqKeys.runs(), 'detail', id] as const,
  events: (params?: Omit<HqListEventsParams, 'beforeId'>) => [...hqKeys.all, 'events', ...(params ? [params] : [])] as const,
  schedules: () => [...hqKeys.all, 'schedules'] as const,
  settings: () => [...hqKeys.all, 'settings'] as const,
  inbox: () => [...hqKeys.all, 'inbox'] as const,
  departments: () => [...hqKeys.all, 'departments'] as const,
  goals: () => [...hqKeys.all, 'goals'] as const,
  goalsList: (status?: HqGoalStatus[]) => [...hqKeys.goals(), 'list', ...(status && status.length ? [status] : [])] as const,
  pastGoals: () => [...hqKeys.goals(), 'past'] as const,
  standup: () => [...hqKeys.all, 'standup'] as const,
  standupFor: (date?: string) => [...hqKeys.standup(), ...(date ? [date] : [])] as const,
  analytics: (days: number) => [...hqKeys.all, 'analytics', days] as const,
  posthog: (days: number) => [...hqKeys.all, 'posthog', days] as const,
  pulse: () => [...hqKeys.all, 'pulse'] as const,
};

/** Anything that changes tasks can move overview counters, member stats and the feed. */
function invalidateWork(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: hqKeys.tasks() });
  queryClient.invalidateQueries({ queryKey: hqKeys.overview() });
  queryClient.invalidateQueries({ queryKey: hqKeys.members() });
  queryClient.invalidateQueries({ queryKey: hqKeys.events() });
  queryClient.invalidateQueries({ queryKey: hqKeys.departments() });
  queryClient.invalidateQueries({ queryKey: hqKeys.standup() });
}

function logFailure(message: string) {
  return (error: unknown) => logger.error('hq', message, getErrorLogDetails(error));
}

// ── Queries ──

interface LiveQueryOptions {
  /** Off for viewers without HQ access (e.g. partner staff) so nothing 403s. */
  enabled?: boolean;
  refetchInterval?: number;
}

export function useHqOverview(options: LiveQueryOptions = {}) {
  return useQuery({
    queryKey: hqKeys.overview(),
    queryFn: () => hqApi.overview(),
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval ?? HQ_LIVE_REFETCH_MS,
  });
}

export function useHqMembers(includeArchived = false, options: LiveQueryOptions = {}) {
  return useQuery({
    queryKey: hqKeys.membersList(includeArchived),
    queryFn: async () => (await hqApi.listMembers(includeArchived)).items,
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval ?? 15_000,
  });
}

export function useHqDepartments(options: LiveQueryOptions = {}) {
  return useQuery({
    queryKey: hqKeys.departments(),
    queryFn: async () => (await hqApi.listDepartments()).items,
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval ?? HQ_LIVE_REFETCH_MS,
  });
}

/** Company pulse changes slowly; poll once a minute. */
export function useHqPulse() {
  return useQuery({
    queryKey: hqKeys.pulse(),
    queryFn: () => hqApi.pulse(),
    refetchInterval: 60_000,
  });
}

export function useHqMember(id: string | undefined) {
  return useQuery({
    queryKey: hqKeys.member(id ?? ''),
    queryFn: () => hqApi.getMember(id!),
    enabled: !!id,
    refetchInterval: 15_000,
  });
}

export function useHqTasks(params?: HqListTasksParams, options?: { keepPrevious?: boolean }) {
  return useQuery({
    queryKey: hqKeys.tasksList(params),
    queryFn: async () => (await hqApi.listTasks(params)).items,
    refetchInterval: HQ_LIVE_REFETCH_MS,
    // Filtered views keep showing the previous results while the new filter loads.
    placeholderData: options?.keepPrevious ? keepPreviousData : undefined,
  });
}

/** `value`, updated only after it has stopped changing for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function useHqTask(id: string | null | undefined) {
  return useQuery({
    queryKey: hqKeys.task(id ?? ''),
    queryFn: () => hqApi.getTask(id!),
    enabled: !!id,
    // Fast only while an agent may be writing to it.
    refetchInterval: (query) => (query.state.data?.status === 'in_progress' ? HQ_LIVE_REFETCH_MS : HQ_SLOW_REFETCH_MS),
  });
}

export function useHqRuns(params?: HqListRunsParams) {
  return useQuery({
    queryKey: hqKeys.runsList(params),
    queryFn: async () => (await hqApi.listRuns(params)).items,
    refetchInterval: HQ_LIVE_REFETCH_MS,
  });
}

export function useHqRun(id: string | null | undefined) {
  return useQuery({
    queryKey: hqKeys.run(id ?? ''),
    queryFn: () => hqApi.getRun(id!),
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.status === 'running' ? HQ_LIVE_REFETCH_MS : false),
  });
}

export function useHqEvents(params?: Omit<HqListEventsParams, 'beforeId'>) {
  const limit = params?.limit ?? EVENTS_PAGE_SIZE;
  return useInfiniteQuery({
    queryKey: hqKeys.events(params),
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }) =>
      (await hqApi.listEvents({ ...params, limit, beforeId: pageParam })).items,
    getNextPageParam: (lastPage) =>
      lastPage.length < limit ? undefined : lastPage[lastPage.length - 1]?.id,
    // A refetch reloads every loaded page in sequence; once the reader has
    // paged back into history, stop polling (new events show on the next visit).
    refetchInterval: (query) => ((query.state.data?.pages.length ?? 0) > 1 ? false : HQ_LIVE_REFETCH_MS),
  });
}

export function useHqSchedules() {
  return useQuery({
    queryKey: hqKeys.schedules(),
    queryFn: async () => (await hqApi.listSchedules()).items,
    refetchInterval: HQ_SLOW_REFETCH_MS,
  });
}

export function useHqSettings() {
  return useQuery({
    queryKey: hqKeys.settings(),
    queryFn: () => hqApi.getSettings(),
    refetchInterval: HQ_SLOW_REFETCH_MS,
  });
}

export function useHqInbox() {
  return useQuery({
    queryKey: hqKeys.inbox(),
    queryFn: async () => (await hqApi.inbox()).items,
    refetchInterval: HQ_LIVE_REFETCH_MS,
  });
}

// ── Task mutations ──

export function useCreateHqTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: HqCreateTaskRequest) => hqApi.createTask(data),
    onSuccess: () => invalidateWork(queryClient),
    onError: logFailure('Failed to create task'),
  });
}

export function useUpdateHqTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: HqUpdateTaskRequest }) => hqApi.updateTask(id, data),
    onSuccess: () => invalidateWork(queryClient),
    onError: logFailure('Failed to update task'),
  });
}

export function useApproveHqTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => hqApi.approveTask(id, note),
    onSuccess: () => invalidateWork(queryClient),
    onError: logFailure('Failed to approve task'),
  });
}

export function useRejectHqTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => hqApi.rejectTask(id, note),
    onSuccess: () => invalidateWork(queryClient),
    onError: logFailure('Failed to send task back'),
  });
}

export function useRunHqTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hqApi.runTask(id),
    onSuccess: () => invalidateWork(queryClient),
    onError: logFailure('Failed to re-run task'),
  });
}

export function usePostHqMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: HqPostMessageRequest }) => hqApi.postMessage(taskId, data),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: hqKeys.task(taskId) });
      queryClient.invalidateQueries({ queryKey: hqKeys.tasks() });
      queryClient.invalidateQueries({ queryKey: hqKeys.events() });
    },
    onError: logFailure('Failed to post message'),
  });
}

// ── Member mutations ──

export function useCreateHqMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: HqCreateMemberRequest) => hqApi.createMember(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hqKeys.members() });
      queryClient.invalidateQueries({ queryKey: hqKeys.departments() });
      queryClient.invalidateQueries({ queryKey: hqKeys.overview() });
    },
    onError: logFailure('Failed to hire agent'),
  });
}

export function useUpdateHqMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: HqUpdateMemberRequest }) => hqApi.updateMember(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hqKeys.members() });
      queryClient.invalidateQueries({ queryKey: hqKeys.departments() });
      queryClient.invalidateQueries({ queryKey: hqKeys.overview() });
      queryClient.invalidateQueries({ queryKey: hqKeys.events() });
    },
    onError: logFailure('Failed to update member'),
  });
}

export function useSyncHqHumans() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => hqApi.syncHumans(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hqKeys.members() });
      queryClient.invalidateQueries({ queryKey: hqKeys.departments() });
      queryClient.invalidateQueries({ queryKey: hqKeys.overview() });
    },
    onError: logFailure('Failed to sync staff'),
  });
}

// ── Schedule mutations ──

function invalidateSchedules(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: hqKeys.schedules() });
  queryClient.invalidateQueries({ queryKey: hqKeys.members() });
  queryClient.invalidateQueries({ queryKey: hqKeys.events() });
}

export function useCreateHqSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: HqCreateScheduleRequest) => hqApi.createSchedule(data),
    onSuccess: () => invalidateSchedules(queryClient),
    onError: logFailure('Failed to create schedule'),
  });
}

export function useUpdateHqSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: HqUpdateScheduleRequest }) => hqApi.updateSchedule(id, data),
    onSuccess: () => invalidateSchedules(queryClient),
    onError: logFailure('Failed to update schedule'),
  });
}

export function useDeleteHqSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hqApi.deleteSchedule(id),
    onSuccess: () => invalidateSchedules(queryClient),
    onError: logFailure('Failed to delete schedule'),
  });
}

export function useRunHqScheduleNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hqApi.runScheduleNow(id),
    onSuccess: () => {
      invalidateSchedules(queryClient);
      invalidateWork(queryClient);
    },
    onError: logFailure('Failed to run schedule'),
  });
}

// ── Settings / inbox ──

export function useUpdateHqSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: HqUpdateSettingsRequest) => hqApi.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hqKeys.settings() });
      queryClient.invalidateQueries({ queryKey: hqKeys.overview() });
      queryClient.invalidateQueries({ queryKey: hqKeys.events() });
    },
    onError: logFailure('Failed to update HQ settings'),
  });
}

export function useMarkHqInboxRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: number[]) => hqApi.markInboxRead(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hqKeys.inbox() });
      queryClient.invalidateQueries({ queryKey: hqKeys.overview() });
    },
    onError: logFailure('Failed to mark inbox read'),
  });
}

// ── v3: goals, standup, proposals, analytics ──

/** Active goals (the backend's default), in board order — one page, no cursor. */
export function useHqGoals() {
  return useQuery({
    queryKey: hqKeys.goalsList(),
    queryFn: async () => (await hqApi.listGoals({ limit: 200 })).items,
    refetchInterval: 30_000,
  });
}

const PAST_GOALS_PAGE = 30;

/** Achieved + dropped goals, newest first, paged with the backend's cursor. */
export function useHqPastGoals(enabled = true) {
  return useInfiniteQuery({
    queryKey: hqKeys.pastGoals(),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => hqApi.listGoals({ status: ['achieved', 'dropped'], limit: PAST_GOALS_PAGE, before: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
  });
}

function invalidateGoals(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: hqKeys.goals() });
  queryClient.invalidateQueries({ queryKey: hqKeys.standup() });
}

export function useCreateHqGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: HqGoalWriteRequest) => hqApi.createGoal(data),
    onSuccess: () => invalidateGoals(queryClient),
    onError: logFailure('Failed to create goal'),
  });
}

export function useUpdateHqGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: HqGoalUpdateRequest }) => hqApi.updateGoal(id, data),
    onSuccess: () => invalidateGoals(queryClient),
    onError: logFailure('Failed to update goal'),
  });
}

export function useDeleteHqGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hqApi.deleteGoal(id),
    onSuccess: () => invalidateGoals(queryClient),
    onError: logFailure('Failed to delete goal'),
  });
}

export function useHqStandup(date?: string) {
  return useQuery({
    queryKey: hqKeys.standupFor(date),
    queryFn: () => hqApi.standup(date),
    refetchInterval: HQ_SLOW_REFETCH_MS,
  });
}

export function useRunHqStandup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => hqApi.runStandup(),
    onSuccess: () => invalidateWork(queryClient),
    onError: logFailure('Failed to start the standup'),
  });
}

/** "Do it" (optionally with the CEO's edits): proposed → todo; the agent picks it up. */
export function useAcceptHqProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: HqAcceptProposalRequest }) => hqApi.acceptProposal(id, data),
    onSuccess: () => invalidateWork(queryClient),
    onError: logFailure('Failed to accept the idea'),
  });
}

/** "Not now": proposed → cancelled; the optional note reaches the agent at its next standup. */
export function useDeclineHqProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => hqApi.declineProposal(id, note),
    onSuccess: () => invalidateWork(queryClient),
    onError: logFailure('Failed to decline the idea'),
  });
}

export function useHqAnalytics(days: number) {
  return useQuery({
    queryKey: hqKeys.analytics(days),
    queryFn: () => hqApi.analytics(days),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useHqPosthog(days: number) {
  return useQuery({
    queryKey: hqKeys.posthog(days),
    queryFn: () => hqApi.posthog(days),
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * A clock for day-dependent labels (greeting, "today", goal periods) that
 * advances while the page stays open — e.g. across Tbilisi midnight, when
 * polling already returns the next day's standup.
 */
export function useHqClock(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
