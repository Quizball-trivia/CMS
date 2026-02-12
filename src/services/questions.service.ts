import { apiClient } from './api-client';
import type {
  Question,
  CreateQuestionRequest,
  UpdateQuestionRequest,
  ListQuestionsParams,
  UpdateQuestionStatusRequest,
  PaginatedResponse,
  BulkCreateQuestionsRequest,
  BulkCreateResponse,
  FindDuplicatesParams,
  DuplicatesResponse,
  CheckDuplicatesRequest,
  CheckDuplicatesResponse,
  I18nField,
} from '@/types';
import { logger } from '@/lib/logger';

export const questionsService = {
  async list(
    params?: ListQuestionsParams,
    signal?: AbortSignal
  ): Promise<PaginatedResponse<Question>> {
    logger.debug('api', 'GET /questions', { params });
    const result = await apiClient.get<PaginatedResponse<Question>>(
      '/questions',
      params as Record<string, string | number | boolean | undefined>,
      signal
    );
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

  async bulkCreate(data: BulkCreateQuestionsRequest): Promise<BulkCreateResponse> {
    logger.debug('api', 'POST /questions/bulk', { count: data.questions.length, category_id: data.category_id });
    // Use longer timeout for bulk operations (10 minutes for up to 500 questions)
    const result = await apiClient.post<BulkCreateResponse>('/questions/bulk', data, {
      timeoutMs: 600000,
    });
    logger.debug('api', 'POST /questions/bulk response', {
      successful: result.successful,
      failed: result.failed,
      total: result.total
    });
    return result;
  },

  async getAllIds(params?: Omit<ListQuestionsParams, 'page' | 'limit'>): Promise<string[]> {
    logger.debug('api', 'Fetching all question IDs', { params });
    const allIds: string[] = [];
    let page = 1;
    const limit = 100; // Fetch in batches of 100
    let hasMore = true;

    while (hasMore) {
      const result = await questionsService.list({ ...params, page, limit });
      allIds.push(...result.data.map(q => q.id));
      hasMore = page < result.total_pages;
      page++;
    }

    logger.debug('api', 'Fetched all question IDs', { total: allIds.length });
    return allIds;
  },

  async translateBackfill(): Promise<{
    status: 'started' | 'done';
    total: number;
    remaining: number;
    categories: number;
  }> {
    logger.debug('api', 'POST /questions/translate/backfill');
    const result = await apiClient.post<{
      status: 'started' | 'done';
      total: number;
      remaining: number;
      categories: number;
    }>('/questions/translate/backfill');
    logger.debug('api', 'POST /questions/translate/backfill response', result);
    return result;
  },

  async translateStatus(): Promise<{
    questions: number;
    categories: number;
  }> {
    return apiClient.get<{ questions: number; categories: number }>('/questions/translate/status');
  },

  async findDuplicates(params?: FindDuplicatesParams): Promise<DuplicatesResponse> {
    logger.debug('api', 'GET /questions/duplicates', { params });
    const result = await apiClient.get<DuplicatesResponse>('/questions/duplicates', params as Record<string, string | number | boolean | undefined>);
    logger.debug('api', 'GET /questions/duplicates response', { total_groups: result.total_groups });
    return result;
  },

  async checkDuplicates(
    data: CheckDuplicatesRequest,
    onProgress?: (checked: number, total: number) => void
  ): Promise<CheckDuplicatesResponse> {
    const BATCH_SIZE = 100;
    const DELAY_BETWEEN_BATCHES_MS = 300;
    const { prompts, locale } = data;

    logger.debug('api', 'POST /questions/check-duplicates', {
      count: prompts.length,
      locale,
    });

    // If within limit, make single request
    if (prompts.length <= BATCH_SIZE) {
      onProgress?.(0, prompts.length);
      const result = await apiClient.post<CheckDuplicatesResponse>('/questions/check-duplicates', data);
      onProgress?.(prompts.length, prompts.length);
      logger.debug('api', 'POST /questions/check-duplicates response', { duplicates_count: result.duplicates.length });
      return result;
    }

    // Chunk prompts into batches of 100
    const chunks: I18nField[][] = [];
    for (let i = 0; i < prompts.length; i += BATCH_SIZE) {
      chunks.push(prompts.slice(i, i + BATCH_SIZE));
    }

    logger.debug('api', 'Splitting check-duplicates into batches', { batches: chunks.length });

    // Make sequential requests with delay to avoid rate limiting
    const allDuplicates: CheckDuplicatesResponse['duplicates'] = [];
    let checkedCount = 0;

    // Report initial progress
    onProgress?.(0, prompts.length);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkStartIndex = i * BATCH_SIZE;

      const result = await apiClient.post<CheckDuplicatesResponse>('/questions/check-duplicates', {
        prompts: chunk,
        locale,
      });

      // Adjust indices to account for chunking offset
      const adjustedDuplicates = result.duplicates.map(dup => ({
        ...dup,
        index: dup.index + chunkStartIndex,
      }));

      allDuplicates.push(...adjustedDuplicates);

      // Update progress after each batch
      checkedCount += chunk.length;
      onProgress?.(checkedCount, prompts.length);

      // Delay between batches (except after last batch)
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
      }
    }

    logger.debug('api', 'POST /questions/check-duplicates combined response', { duplicates_count: allDuplicates.length });

    return { duplicates: allDuplicates };
  },
};
