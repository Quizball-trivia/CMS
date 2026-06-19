import { apiClient } from './api-client';
import type {
  AuctionCardDetail,
  ListAuctionCardsParams,
  PaginatedAuctionCardsResponse,
  UpdateAuctionCardRequest,
  UpdateAuctionCardStatusRequest,
} from '@/types';

const AUCTION_ADMIN_PATH = '/admin/auction';

export const auctionService = {
  async listCards(
    params?: ListAuctionCardsParams,
    signal?: AbortSignal
  ): Promise<PaginatedAuctionCardsResponse> {
    return apiClient.get<PaginatedAuctionCardsResponse>(
      `${AUCTION_ADMIN_PATH}/cards`,
      params as Record<string, string | number | boolean | undefined>,
      signal
    );
  },

  async getCardById(id: string): Promise<AuctionCardDetail> {
    return apiClient.get<AuctionCardDetail>(`${AUCTION_ADMIN_PATH}/cards/${id}`);
  },

  async updateCard(id: string, data: UpdateAuctionCardRequest): Promise<AuctionCardDetail> {
    return apiClient.patch<AuctionCardDetail>(`${AUCTION_ADMIN_PATH}/cards/${id}`, data);
  },

  async updateCardStatus(
    id: string,
    data: UpdateAuctionCardStatusRequest
  ): Promise<AuctionCardDetail> {
    return apiClient.patch<AuctionCardDetail>(`${AUCTION_ADMIN_PATH}/cards/${id}/status`, data);
  },
};
