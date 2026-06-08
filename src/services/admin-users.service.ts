import { apiClient } from './api-client';
import type {
  AdminProgressionResult,
  AdminSetProgressionBody,
  AdminUsersListQuery,
  AdminUsersListResponse,
  LeaderboardResetBody,
  LeaderboardResetResponse,
} from '@/types/admin-users';

/** Body for the existing store admin wallet-adjustment endpoint (coins/tickets). */
interface WalletAdjustmentBody {
  userId: string;
  coinsDelta?: number;
  ticketsDelta?: number;
  reason: string;
  idempotencyKey?: string;
}

interface WalletAdjustmentResult {
  applied: boolean;
  wallet: { coins: number; tickets: number };
  inventoryApplied: Array<{ productSlug: string; quantity: number }>;
}

export const adminUsersService = {
  async list(query: AdminUsersListQuery): Promise<AdminUsersListResponse> {
    return apiClient.get<AdminUsersListResponse>(
      '/admin/users',
      query as Record<string, string | number | boolean | undefined>
    );
  },

  async setProgression(
    userId: string,
    body: AdminSetProgressionBody
  ): Promise<AdminProgressionResult> {
    return apiClient.patch<AdminProgressionResult>(
      `/admin/users/${userId}/progression`,
      body
    );
  },

  async adjustWallet(body: WalletAdjustmentBody): Promise<WalletAdjustmentResult> {
    return apiClient.post<WalletAdjustmentResult>('/store/admin/adjustments', body);
  },

  async resetLeaderboard(body: LeaderboardResetBody): Promise<LeaderboardResetResponse> {
    return apiClient.post<LeaderboardResetResponse>('/admin/leaderboard/reset', body);
  },
};
