// Data layer for the QuizBall HQ admin section (`/admin/hq`).
//
// Like `agents-api.ts`, these endpoints are not in the generated OpenAPI spec,
// so we go through the shared `apiClient` (bearer token, 401 refresh,
// `ApiClientError`) and type responses with the hand-written `@/types/hq`.

import { apiClient } from '@/services';
import { normalizeTaskSearch } from '@/lib/hq-board';
import type {
  HqAcceptProposalRequest,
  HqAnalytics,
  HqGoal,
  HqGoalHorizon,
  HqGoalPage,
  HqGoalStatus,
  HqGoalUpdateRequest,
  HqGoalWriteRequest,
  HqPosthog,
  HqStandup,
  HqCreateMemberRequest,
  HqCreateScheduleRequest,
  HqCreateTaskRequest,
  HqDepartment,
  HqEvent,
  HqListEventsParams,
  HqListRunsParams,
  HqListTasksParams,
  HqMember,
  HqMemberDetail,
  HqMessage,
  HqOverview,
  HqPostMessageRequest,
  HqPulse,
  HqRun,
  HqRunDetail,
  HqSchedule,
  HqSettings,
  HqTask,
  HqTaskDetail,
  HqUpdateMemberRequest,
  HqUpdateScheduleRequest,
  HqUpdateSettingsRequest,
  HqUpdateTaskRequest,
} from '@/types';

const BASE = '/admin/hq';

interface ItemsResponse<T> {
  items: T[];
}

type QueryParams = Record<string, string | number | boolean | undefined>;

function taskQuery(params?: HqListTasksParams): QueryParams | undefined {
  if (!params) return undefined;
  return {
    status: params.status && params.status.length > 0 ? params.status.join(',') : undefined,
    assigneeId: params.assigneeId || undefined,
    department: params.department || undefined,
    kind: params.kind && params.kind.length > 0 ? params.kind.join(',') : undefined,
    goalId: params.goalId || undefined,
    q: normalizeTaskSearch(params.q),
    limit: params.limit,
  };
}

export const hqApi = {
  overview(): Promise<HqOverview> {
    return apiClient.get<HqOverview>(`${BASE}/overview`);
  },

  // ── Members ──
  listMembers(includeArchived = false): Promise<ItemsResponse<HqMember>> {
    return apiClient.get<ItemsResponse<HqMember>>(`${BASE}/members`, includeArchived ? { includeArchived: true } : undefined);
  },
  getMember(id: string): Promise<HqMemberDetail> {
    return apiClient.get<HqMemberDetail>(`${BASE}/members/${id}`);
  },
  createMember(data: HqCreateMemberRequest): Promise<HqMember> {
    return apiClient.post<HqMember>(`${BASE}/members`, data);
  },
  updateMember(id: string, data: HqUpdateMemberRequest): Promise<HqMember> {
    return apiClient.patch<HqMember>(`${BASE}/members/${id}`, data);
  },
  syncHumans(): Promise<ItemsResponse<HqMember>> {
    return apiClient.post<ItemsResponse<HqMember>>(`${BASE}/members/sync-humans`, {});
  },

  // ── Tasks ──
  listTasks(params?: HqListTasksParams): Promise<ItemsResponse<HqTask>> {
    return apiClient.get<ItemsResponse<HqTask>>(`${BASE}/tasks`, taskQuery(params));
  },
  getTask(id: string): Promise<HqTaskDetail> {
    return apiClient.get<HqTaskDetail>(`${BASE}/tasks/${id}`);
  },
  createTask(data: HqCreateTaskRequest): Promise<HqTask> {
    return apiClient.post<HqTask>(`${BASE}/tasks`, data);
  },
  updateTask(id: string, data: HqUpdateTaskRequest): Promise<HqTask> {
    return apiClient.patch<HqTask>(`${BASE}/tasks/${id}`, data);
  },
  approveTask(id: string, note?: string): Promise<HqTask> {
    return apiClient.post<HqTask>(`${BASE}/tasks/${id}/approve`, note ? { note } : {});
  },
  rejectTask(id: string, note: string): Promise<HqTask> {
    return apiClient.post<HqTask>(`${BASE}/tasks/${id}/reject`, { note });
  },
  runTask(id: string): Promise<HqTask> {
    return apiClient.post<HqTask>(`${BASE}/tasks/${id}/run`, {});
  },
  postMessage(taskId: string, data: HqPostMessageRequest): Promise<HqMessage> {
    return apiClient.post<HqMessage>(`${BASE}/tasks/${taskId}/messages`, data);
  },

  // ── Runs ──
  listRuns(params?: HqListRunsParams): Promise<ItemsResponse<HqRun>> {
    return apiClient.get<ItemsResponse<HqRun>>(`${BASE}/runs`, params as QueryParams | undefined);
  },
  getRun(id: string): Promise<HqRunDetail> {
    return apiClient.get<HqRunDetail>(`${BASE}/runs/${id}`);
  },

  // ── Events ──
  listEvents(params?: HqListEventsParams): Promise<ItemsResponse<HqEvent>> {
    return apiClient.get<ItemsResponse<HqEvent>>(`${BASE}/events`, params as QueryParams | undefined);
  },

  // ── Schedules ──
  listSchedules(): Promise<ItemsResponse<HqSchedule>> {
    return apiClient.get<ItemsResponse<HqSchedule>>(`${BASE}/schedules`);
  },
  createSchedule(data: HqCreateScheduleRequest): Promise<HqSchedule> {
    return apiClient.post<HqSchedule>(`${BASE}/schedules`, data);
  },
  updateSchedule(id: string, data: HqUpdateScheduleRequest): Promise<HqSchedule> {
    return apiClient.patch<HqSchedule>(`${BASE}/schedules/${id}`, data);
  },
  deleteSchedule(id: string): Promise<void> {
    return apiClient.delete<void>(`${BASE}/schedules/${id}`);
  },
  runScheduleNow(id: string): Promise<HqTask> {
    return apiClient.post<HqTask>(`${BASE}/schedules/${id}/run-now`, {});
  },

  // ── Goals ──
  /**
   * Goals. No `status` → active goals only (board order, `nextCursor` null).
   * Lists that include achieved/dropped are paged newest first: pass the
   * previous page's `nextCursor` as `before`.
   */
  listGoals(
    params: { status?: HqGoalStatus[]; horizon?: HqGoalHorizon; limit?: number; before?: string } = {}
  ): Promise<HqGoalPage> {
    return apiClient.get<HqGoalPage>(`${BASE}/goals`, {
      status: params.status && params.status.length > 0 ? params.status.join(',') : undefined,
      horizon: params.horizon,
      limit: params.limit,
      before: params.before,
    });
  },
  createGoal(data: HqGoalWriteRequest): Promise<HqGoal> {
    return apiClient.post<HqGoal>(`${BASE}/goals`, data);
  },
  updateGoal(id: string, data: HqGoalUpdateRequest): Promise<HqGoal> {
    return apiClient.patch<HqGoal>(`${BASE}/goals/${id}`, data);
  },
  deleteGoal(id: string): Promise<void> {
    return apiClient.delete<void>(`${BASE}/goals/${id}`);
  },

  // ── Standup + proposals ──
  standup(date?: string): Promise<HqStandup> {
    return apiClient.get<HqStandup>(`${BASE}/standup`, date ? { date } : undefined);
  },
  runStandup(): Promise<{ created: number }> {
    return apiClient.post<{ created: number }>(`${BASE}/standup/run`, {});
  },
  acceptProposal(id: string, data: HqAcceptProposalRequest = {}): Promise<HqTask> {
    return apiClient.post<HqTask>(`${BASE}/tasks/${id}/accept-proposal`, data);
  },
  declineProposal(id: string, note?: string): Promise<HqTask> {
    return apiClient.post<HqTask>(`${BASE}/tasks/${id}/decline-proposal`, note ? { note } : {});
  },

  // ── Analytics ──
  analytics(days: number): Promise<HqAnalytics> {
    return apiClient.get<HqAnalytics>(`${BASE}/analytics`, { days });
  },
  posthog(days: number): Promise<HqPosthog> {
    return apiClient.get<HqPosthog>(`${BASE}/analytics/posthog`, { days });
  },

  // ── Departments / pulse ──
  listDepartments(): Promise<ItemsResponse<HqDepartment>> {
    return apiClient.get<ItemsResponse<HqDepartment>>(`${BASE}/departments`);
  },
  pulse(days = 14): Promise<HqPulse> {
    return apiClient.get<HqPulse>(`${BASE}/pulse`, { days });
  },

  // ── Settings / inbox ──
  getSettings(): Promise<HqSettings> {
    return apiClient.get<HqSettings>(`${BASE}/settings`);
  },
  updateSettings(data: HqUpdateSettingsRequest): Promise<HqSettings> {
    return apiClient.patch<HqSettings>(`${BASE}/settings`, data);
  },
  inbox(): Promise<ItemsResponse<HqMessage>> {
    return apiClient.get<ItemsResponse<HqMessage>>(`${BASE}/inbox`);
  },
  markInboxRead(ids?: number[]): Promise<void> {
    return apiClient.post<void>(`${BASE}/inbox/read`, ids ? { ids } : {});
  },
};
