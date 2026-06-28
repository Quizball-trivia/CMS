// Data layer for the Agents admin section.
//
// The new `/admin/agents` backend endpoints are NOT yet part of the generated
// OpenAPI spec, so the type-safe `openapi-fetch` client in `src/lib/api.ts`
// cannot describe them. Instead we reuse the existing `apiClient` service
// (src/services/api-client.ts): it already targets the same `API_BASE_URL`
// (which includes the `/api/v1` prefix), attaches the bearer token from
// localStorage, transparently refreshes on 401, and throws `ApiClientError` —
// exactly the fetch/error conventions the rest of the CMS relies on. Endpoints
// are passed as plain strings, so these calls are intentionally untyped at the
// wire level and typed here via our hand-written `@/types/agents` shapes.

import { apiClient } from '@/services';
import type {
  AgentBudget,
  AgentEvent,
  AgentJob,
  AgentMonitor,
  AgentPrompt,
  AgentPromptVersion,
  AgentQuestionType,
  AgentRosterEntry,
  AgentTask,
  ListAgentJobsParams,
  SaveAgentPromptRequest,
  SpawnAgentJobRequest,
  UpdateAgentBudgetRequest,
  UpdateAgentQuestionTypeRequest,
} from '@/types';

const BASE = '/admin/agents';

interface ItemsResponse<T> {
  items: T[];
}

export const agentsApi = {
  listJobs(params?: ListAgentJobsParams): Promise<ItemsResponse<AgentJob>> {
    return apiClient.get<ItemsResponse<AgentJob>>(
      `${BASE}/jobs`,
      params as Record<string, string | number | boolean | undefined> | undefined
    );
  },

  spawnJob(data: SpawnAgentJobRequest): Promise<AgentJob> {
    return apiClient.post<AgentJob>(`${BASE}/jobs`, data);
  },

  getJob(jobId: string): Promise<AgentJob> {
    return apiClient.get<AgentJob>(`${BASE}/jobs/${jobId}`);
  },

  cancelJob(jobId: string): Promise<void> {
    return apiClient.delete<void>(`${BASE}/jobs/${jobId}`);
  },

  listJobTasks(jobId: string): Promise<ItemsResponse<AgentTask>> {
    return apiClient.get<ItemsResponse<AgentTask>>(`${BASE}/jobs/${jobId}/tasks`);
  },

  listJobEvents(jobId: string): Promise<ItemsResponse<AgentEvent>> {
    return apiClient.get<ItemsResponse<AgentEvent>>(`${BASE}/jobs/${jobId}/events`);
  },

  retryTask(taskId: string): Promise<void> {
    return apiClient.post<void>(`${BASE}/tasks/${taskId}/retry`);
  },

  getMonitor(): Promise<AgentMonitor> {
    return apiClient.get<AgentMonitor>(`${BASE}/monitor`);
  },

  getRoster(): Promise<ItemsResponse<AgentRosterEntry>> {
    return apiClient.get<ItemsResponse<AgentRosterEntry>>(`${BASE}/roster`);
  },

  getBudget(): Promise<AgentBudget> {
    return apiClient.get<AgentBudget>(`${BASE}/budget`);
  },

  setBudget(data: UpdateAgentBudgetRequest): Promise<AgentBudget> {
    return apiClient.patch<AgentBudget>(`${BASE}/budget`, data);
  },

  listQuestionTypes(): Promise<ItemsResponse<AgentQuestionType>> {
    return apiClient.get<ItemsResponse<AgentQuestionType>>(`${BASE}/question-types`);
  },

  updateQuestionType(
    type: string,
    data: UpdateAgentQuestionTypeRequest
  ): Promise<AgentQuestionType> {
    return apiClient.patch<AgentQuestionType>(`${BASE}/question-types/${type}`, data);
  },

  // `type` defaults to omitted, which the backend treats as the '*' role-level
  // defaults — preserving the original (type-less) behavior.
  listPrompts(type?: string): Promise<ItemsResponse<AgentPrompt>> {
    return apiClient.get<ItemsResponse<AgentPrompt>>(
      `${BASE}/prompts`,
      type ? { type } : undefined
    );
  },

  getPromptHistory(role: string, type?: string): Promise<ItemsResponse<AgentPromptVersion>> {
    return apiClient.get<ItemsResponse<AgentPromptVersion>>(
      `${BASE}/prompts/${role}/history`,
      type ? { type } : undefined
    );
  },

  savePrompt(role: string, data: SaveAgentPromptRequest): Promise<AgentPrompt> {
    return apiClient.put<AgentPrompt>(`${BASE}/prompts/${role}`, data);
  },

  activatePromptVersion(promptId: string): Promise<AgentPrompt> {
    return apiClient.post<AgentPrompt>(`${BASE}/prompts/${promptId}/activate`);
  },
};
