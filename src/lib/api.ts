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
 *   npm run generate:api
 */
import createClient from 'openapi-fetch';
import type { paths } from '@/types/api.generated';
import { AUTH_TOKEN_KEY } from './constants';

// The generated paths already carry the /api/v1 prefix; some environments
// set NEXT_PUBLIC_API_URL with the prefix baked in (the legacy relative-path
// clients want it that way). Strip it so both env shapes work — otherwise
// requests go to /api/v1/api/v1/... and 404.
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001')
  .replace(/\/api\/v1\/?$/, '');

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
