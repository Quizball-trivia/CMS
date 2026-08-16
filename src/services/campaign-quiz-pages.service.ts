import { apiClient } from './api-client';
import type {
  QuizPage,
  QuizPageInput,
  QuizPageListFilters,
  QuizPageListItem,
  QuizPageRetireInput,
  QuizQuestionSet,
  QuizPageGooglebotInspection,
  QuizPageHubOrderInput,
  QuizPageRevision,
  QuizPageSearchConsoleMetrics,
  QuizPageGeneratedImage,
} from '@/types';

const BASE = '/admin/campaign-quizzes';

export const campaignQuizPagesService = {
  list(filters?: QuizPageListFilters): Promise<QuizPageListItem[]> {
    return apiClient.get(BASE, filters as Record<string, string | undefined>);
  },
  get(slug: string): Promise<QuizPage> {
    return apiClient.get(`${BASE}/${slug}`);
  },
  listQuestionSets(): Promise<QuizQuestionSet[]> {
    return apiClient.get(`${BASE}/question-sets`);
  },
  searchConsole(): Promise<QuizPageSearchConsoleMetrics> {
    return apiClient.get(`${BASE}/search-console`);
  },
  updateHubOrder(input: QuizPageHubOrderInput): Promise<void> {
    return apiClient.patch(`${BASE}/hub-order`, input);
  },
  create(input: QuizPageInput): Promise<QuizPage> {
    return apiClient.post(BASE, input);
  },
  update(currentSlug: string, input: QuizPageInput): Promise<QuizPage> {
    return apiClient.put(`${BASE}/${currentSlug}`, input);
  },
  preview(slug: string): Promise<QuizPage> {
    return apiClient.post(`${BASE}/${slug}/preview`);
  },
  googlebot(slug: string): Promise<QuizPageGooglebotInspection> {
    return apiClient.get(`${BASE}/${slug}/googlebot`);
  },
  revisions(slug: string): Promise<QuizPageRevision[]> {
    return apiClient.get(`${BASE}/${slug}/revisions`);
  },
  restoreRevision(slug: string, revisionId: number): Promise<QuizPage> {
    return apiClient.post(`${BASE}/${slug}/revisions/${revisionId}/restore`);
  },
  publish(slug: string, scheduledPublishAt: string | null): Promise<QuizPage> {
    return apiClient.post(`${BASE}/${slug}/publish`, {
      scheduled_publish_at: scheduledPublishAt,
    });
  },
  unpublish(slug: string, input: QuizPageRetireInput): Promise<void> {
    return apiClient.post(`${BASE}/${slug}/unpublish`, input);
  },
  remove(slug: string, input: QuizPageRetireInput): Promise<void> {
    return apiClient.delete(`${BASE}/${slug}`, input);
  },
  uploadImage(dataUrl: string, kind: 'hero' | 'og', slug: string): Promise<{
    url: string;
    width: number;
    height: number;
    environment: 'local' | 'staging' | 'prod';
  }> {
    return apiClient.post(`${BASE}/images`, { data_url: dataUrl, kind, slug }, { timeoutMs: 180_000 });
  },
  generateImage(prompt: string): Promise<QuizPageGeneratedImage> {
    return apiClient.post(
      `${BASE}/images/generate`,
      { prompt },
      { timeoutMs: 180_000, retryOnUnauthorized: false },
    );
  },
};
