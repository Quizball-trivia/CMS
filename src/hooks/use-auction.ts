import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { auctionService } from '@/services';
import type {
  AuctionCardDetail,
  ListAuctionCardsParams,
  UpdateAuctionCardRequest,
  UpdateAuctionCardStatusRequest,
} from '@/types';
import { logger } from '@/lib/logger';
import { getErrorLogDetails } from '@/lib/error-feedback';

export const auctionKeys = {
  all: ['auction'] as const,
  cards: () => [...auctionKeys.all, 'cards'] as const,
  cardList: (params?: ListAuctionCardsParams) => [...auctionKeys.cards(), 'list', params] as const,
  cardDetails: () => [...auctionKeys.cards(), 'detail'] as const,
  cardDetail: (id: string) => [...auctionKeys.cardDetails(), id] as const,
};

export function useAuctionCards(params?: ListAuctionCardsParams) {
  return useQuery({
    queryKey: auctionKeys.cardList(params),
    queryFn: ({ signal }) => auctionService.listCards(params, signal),
  });
}

export function useAuctionCard(id: string, enabled = true) {
  return useQuery({
    queryKey: auctionKeys.cardDetail(id),
    queryFn: () => auctionService.getCardById(id),
    enabled: enabled && Boolean(id),
  });
}

export function useUpdateAuctionCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAuctionCardRequest }) =>
      auctionService.updateCard(id, data),
    onSuccess: (card: AuctionCardDetail, variables) => {
      queryClient.setQueryData(auctionKeys.cardDetail(variables.id), card);
      queryClient.invalidateQueries({ queryKey: auctionKeys.cards() });
    },
    onError: (error, variables) => {
      logger.error('auction', 'Failed to update auction card', {
        id: variables.id,
        ...getErrorLogDetails(error),
      });
    },
  });
}

export function useUpdateAuctionCardStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAuctionCardStatusRequest }) =>
      auctionService.updateCardStatus(id, data),
    onSuccess: (card: AuctionCardDetail, variables) => {
      queryClient.setQueryData(auctionKeys.cardDetail(variables.id), card);
      queryClient.invalidateQueries({ queryKey: auctionKeys.cards() });
    },
    onError: (error, variables) => {
      logger.error('auction', 'Failed to update auction card status', {
        id: variables.id,
        nextStatus: variables.data.status,
        force: variables.data.force,
        ...getErrorLogDetails(error),
      });
    },
  });
}
