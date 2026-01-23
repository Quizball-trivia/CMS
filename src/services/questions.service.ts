import { apiClient } from './api-client';
import type {
  Question,
  CreateQuestionRequest,
  UpdateQuestionRequest,
  ListQuestionsParams,
  UpdateQuestionStatusRequest,
  PaginatedResponse,
} from '@/types';

export const questionsService = {
  async list(params?: ListQuestionsParams): Promise<PaginatedResponse<Question>> {
    return apiClient.get<PaginatedResponse<Question>>('/questions', params as Record<string, string | number | boolean | undefined>);
  },

  async getById(id: string): Promise<Question> {
    return apiClient.get<Question>(`/questions/${id}`);
  },

  async create(data: CreateQuestionRequest): Promise<Question> {
    return apiClient.post<Question>('/questions', data);
  },

  async update(id: string, data: UpdateQuestionRequest): Promise<Question> {
    return apiClient.put<Question>(`/questions/${id}`, data);
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/questions/${id}`);
  },

  async updateStatus(id: string, data: UpdateQuestionStatusRequest): Promise<Question> {
    return apiClient.patch<Question>(`/questions/${id}/status`, data);
  },
};
