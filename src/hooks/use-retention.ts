import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { retentionService } from '@/services/retention.service';

const retentionKeys = {
  dashboard: ['retention', 'reactivation-dashboard'] as const,
};

export function useRetentionDashboard() {
  return useQuery({
    queryKey: retentionKeys.dashboard,
    queryFn: ({ signal }) => retentionService.getDashboard(signal),
    refetchInterval: 60_000,
  });
}

export function usePauseRetentionJourney() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => retentionService.pause(),
    onSuccess: () => client.invalidateQueries({ queryKey: retentionKeys.dashboard }),
  });
}
