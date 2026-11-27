import { useQuery } from '@tanstack/react-query';
import { adminAnalyticsService } from '@/services/admin-analytics.service';
import type { AudiencePeriod } from '@/types/admin-audience';

const analyticsKeys = {
  audience: (period: AudiencePeriod) => ['admin-analytics', 'audience', period] as const,
};

export function useAudience(period: AudiencePeriod) {
  return useQuery({
    queryKey: analyticsKeys.audience(period),
    queryFn: ({ signal }) => adminAnalyticsService.getAudience(period, signal),
    refetchInterval: 5 * 60_000,
  });
}
