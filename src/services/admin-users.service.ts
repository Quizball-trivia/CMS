import { apiClient } from './api-client';
import type {
  AdminProgressionResult,
  AdminSetProgressionBody,
  AdminUserListItem,
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
  notify?: boolean;
}

interface WalletAdjustmentResult {
  applied: boolean;
  wallet: { coins: number; tickets: number };
  inventoryApplied: Array<{ productSlug: string; quantity: number }>;
}

interface ResetTicketWindowBody {
  userId: string;
  reason: string;
}

interface ResetTicketWindowResult {
  voided: number;
  wallet: { coins: number; tickets: number };
}

/**
 * Ban a player. Hand-typed (not from the generated OpenAPI spec) so the CMS can
 * ship the ban UI before the spec is regenerated. `zeroRp` defaults to true on
 * the backend (snapshots + zeroes RP; restored on unban).
 */
interface BanUserBody {
  reason: string;
  zeroRp?: boolean;
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

  async resetTicketWindow(body: ResetTicketWindowBody): Promise<ResetTicketWindowResult> {
    return apiClient.post<ResetTicketWindowResult>('/store/admin/reset-ticket-window', body);
  },

  async resetLeaderboard(body: LeaderboardResetBody): Promise<LeaderboardResetResponse> {
    return apiClient.post<LeaderboardResetResponse>('/admin/leaderboard/reset', body);
  },

  async banUser(userId: string, body: BanUserBody): Promise<AdminUserListItem> {
    return apiClient.post<AdminUserListItem>(`/admin/users/${userId}/ban`, body);
  },

  async unbanUser(userId: string): Promise<AdminUserListItem> {
    return apiClient.post<AdminUserListItem>(`/admin/users/${userId}/unban`, {});
  },
};
