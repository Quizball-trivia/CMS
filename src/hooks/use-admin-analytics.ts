import { useQuery } from '@tanstack/react-query';
import { adminAnalyticsService } from '@/services/admin-analytics.service';
import type { AudiencePeriod } from '@/types/admin-audience';

const analyticsKeys = {
  overview: ['admin-analytics', 'overview'] as const,
  audience: (period: AudiencePeriod) => ['admin-analytics', 'audience', period] as const,
};

export function useAnalyticsOverview() {
  return useQuery({
    queryKey: analyticsKeys.overview,
    queryFn: ({ signal }) => adminAnalyticsService.getOverview(signal),
    refetchInterval: 60_000,
  });
}

export function useAudience(period: AudiencePeriod) {
  return useQuery({
    queryKey: analyticsKeys.audience(period),
    queryFn: ({ signal }) => adminAnalyticsService.getAudience(period, signal),
    refetchInterval: 5 * 60_000,
  });
}
