import { useQuery } from '@tanstack/react-query';
import { adminAnalyticsService } from '@/services/admin-analytics.service';

const analyticsKeys = {
  overview: ['admin-analytics', 'overview'] as const,
};

export function useAnalyticsOverview() {
  return useQuery({
    queryKey: analyticsKeys.overview,
    queryFn: ({ signal }) => adminAnalyticsService.getOverview(signal),
    refetchInterval: 60_000,
  });
}
