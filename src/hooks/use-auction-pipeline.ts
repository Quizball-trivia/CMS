import { useQuery } from '@tanstack/react-query';
import { auctionPipelineService } from '@/services';

const PIPELINE_REFETCH_MS = 30000;

export const auctionPipelineKeys = {
  all: ['auction', 'pipeline'] as const,
  stats: () => [...auctionPipelineKeys.all, 'stats'] as const,
};

export function useAuctionPipelineStats() {
  return useQuery({
    queryKey: auctionPipelineKeys.stats(),
    queryFn: ({ signal }) => auctionPipelineService.getStats(signal),
    refetchInterval: PIPELINE_REFETCH_MS,
  });
}
