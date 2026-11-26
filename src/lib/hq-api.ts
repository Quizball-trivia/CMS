// Product analytics for HQ (`/admin/hq/analytics`). These endpoints are not in
// the generated OpenAPI spec, so they go through the shared `apiClient`
// (bearer token, 401 refresh, `ApiClientError`) with hand-written types.

import { apiClient } from '@/services';
import type { HqAnalytics, HqPosthog } from '@/types';

const BASE = '/admin/hq';

export const hqApi = {
  analytics(days: number): Promise<HqAnalytics> {
    return apiClient.get<HqAnalytics>(`${BASE}/analytics`, { days });
  },
  posthog(days: number): Promise<HqPosthog> {
    return apiClient.get<HqPosthog>(`${BASE}/analytics/posthog`, { days });
  },
};
