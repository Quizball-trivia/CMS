/**
 * Type-safe API client using openapi-fetch.
 *
 * This client provides full type safety for all API calls by leveraging
 * the auto-generated types from the OpenAPI spec.
 *
 * Usage:
 *   const { data, error } = await api.GET('/api/v1/categories/{id}', {
 *     params: { path: { id: 'uuid' } }
 *   });
 *
 * After backend API changes:
 *   npm run api:sync
 */
import createClient from 'openapi-fetch';
import type { paths } from '@/types/api.generated';
import { AUTH_TOKEN_KEY } from './constants';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

/**
 * Type-safe API client instance.
 * All methods are fully typed based on the OpenAPI spec.
 */
export const api = createClient<paths>({
  baseUrl: API_BASE_URL,
});

/**
 * Middleware to add auth token to requests.
 */
api.use({
  onRequest: ({ request }) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (token) {
        request.headers.set('Authorization', `Bearer ${token}`);
      }
    }
    return request;
  },
});

// =============================================================================
// Helper Types - Extract response/request types from the generated paths
// =============================================================================

/** Extract successful response type from a path */
export type ApiResponse<
  Path extends keyof paths,
  Method extends keyof paths[Path]
> = paths[Path][Method] extends { responses: { 200: { content: { 'application/json': infer R } } } }
  ? R
  : paths[Path][Method] extends { responses: { 201: { content: { 'application/json': infer R } } } }
  ? R
  : paths[Path][Method] extends { responses: { 207: { content: { 'application/json': infer R } } } }
  ? R
  : never;

/** Extract request body type from a path */
export type ApiRequestBody<
  Path extends keyof paths,
  Method extends keyof paths[Path]
> = paths[Path][Method] extends { requestBody: { content: { 'application/json': infer R } } }
  ? R
  : never;

// =============================================================================
// Re-export component schemas for convenience
// =============================================================================

import type { components } from '@/types/api.generated';

export type { components };

// Common response types
export type Category = components['schemas']['CategoryResponse'];
export type Question = components['schemas']['QuestionResponse'];
export type User = components['schemas']['UserResponse'];
export type FeaturedCategory = components['schemas']['FeaturedCategoryResponse'];
export type I18nField = components['schemas']['I18nField'];
export type ErrorResponse = components['schemas']['ErrorResponse'];
export type AuthResponse = components['schemas']['AuthResponse'];
export type PaginatedCategories = components['schemas']['PaginatedCategoriesResponse'];
export type PaginatedQuestions = components['schemas']['PaginatedQuestionsResponse'];
export type BulkCreateResponse = components['schemas']['BulkCreateResponse'];
export type CategoryDependencies = components['schemas']['CategoryDependenciesResponse'];
