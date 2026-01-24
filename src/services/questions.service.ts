import { apiClient } from './api-client';
import type {
  Question,
  CreateQuestionRequest,
  UpdateQuestionRequest,
  ListQuestionsParams,
  UpdateQuestionStatusRequest,
  PaginatedResponse,
} from '@/types';
import { logger } from '@/lib/logger';

export const questionsService = {
  async list(params?: ListQuestionsParams): Promise<PaginatedResponse<Question>> {
    logger.debug('api', 'GET /questions', { params });
    const result = await apiClient.get<PaginatedResponse<Question>>('/questions', params as Record<string, string | number | boolean | undefined>);
    logger.debug('api', 'GET /questions response', { count: result.data.length, total: result.total });
    return result;
  },

  async getById(id: string): Promise<Question> {
    logger.debug('api', `GET /questions/${id}`);
    const result = await apiClient.get<Question>(`/questions/${id}`);
    logger.debug('api', `GET /questions/${id} response`, { type: result.type, hasPayload: !!result.payload, payload: result.payload });
    return result;
  },

  async create(data: CreateQuestionRequest): Promise<Question> {
    logger.debug('api', 'POST /questions', { data });
    const result = await apiClient.post<Question>('/questions', data);
    logger.debug('api', 'POST /questions response', { id: result.id, type: result.type });
    return result;
  },

  async update(id: string, data: UpdateQuestionRequest): Promise<Question> {
    logger.debug('api', `PUT /questions/${id}`, { data });
    const result = await apiClient.put<Question>(`/questions/${id}`, data);
    logger.debug('api', `PUT /questions/${id} response`, { type: result.type, hasPayload: !!result.payload });
    return result;
  },

  async delete(id: string): Promise<void> {
    logger.debug('api', `DELETE /questions/${id}`);
    return apiClient.delete<void>(`/questions/${id}`);
  },

  async updateStatus(id: string, data: UpdateQuestionStatusRequest): Promise<Question> {
    logger.debug('api', `PATCH /questions/${id}/status`, { data });
    const result = await apiClient.patch<Question>(`/questions/${id}/status`, data);
    logger.debug('api', `PATCH /questions/${id}/status response`, { status: result.status });
    return result;
  },
};
