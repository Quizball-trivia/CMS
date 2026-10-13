import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { adminUsersService } from '@/services';
import type {
  AdminSetProgressionBody,
  AdminUsersListQuery,
  LeaderboardResetBody,
} from '@/types/admin-users';
import { logger } from '@/lib/logger';
import { getErrorLogDetails } from '@/lib/error-feedback';

export const adminUserKeys = {
  all: ['admin-users'] as const,
  lists: () => [...adminUserKeys.all, 'list'] as const,
  list: (query: AdminUsersListQuery) => [...adminUserKeys.lists(), query] as const,
};

export function useAdminUsers(query: AdminUsersListQuery) {
  return useQuery({
    queryKey: adminUserKeys.list(query),
    queryFn: () => adminUsersService.list(query),
    placeholderData: keepPreviousData,
  });
}

/** Display multiplier: CMS shows the live Postgres total × 1.8. */
export const USER_TOTAL_DISPLAY_MULTIPLIER = 1.8;

/**
 * Live guest-inclusive user total from the backend (per-env: staging CMS reads
 * the staging DB, prod reads prod). Refreshes every 5 min. Callers fall back
 * to the demo anchor while loading or when the backend is unreachable.
 */
export function useUserTotal() {
  return useQuery({
    queryKey: [...adminUserKeys.all, 'total'],
    queryFn: () => adminUsersService.userTotal(),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useSetProgression() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: AdminSetProgressionBody }) =>
      adminUsersService.setProgression(userId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
    },
    onError: (error, variables) => {
      logger.error('admin-users', 'Failed to set progression', {
        userId: variables.userId,
        ...getErrorLogDetails(error),
      });
    },
  });
}

export function useAdjustWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: {
      userId: string;
      coinsDelta?: number;
      ticketsDelta?: number;
      reason: string;
      idempotencyKey?: string;
      notify?: boolean;
    }) => adminUsersService.adjustWallet(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
    },
    onError: (error, variables) => {
      logger.error('admin-users', 'Failed to adjust wallet', {
        userId: variables.userId,
        ...getErrorLogDetails(error),
      });
    },
  });
}

export function useResetTicketWindow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: { userId: string; reason: string }) =>
      adminUsersService.resetTicketWindow(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
    },
    onError: (error, variables) => {
      logger.error('admin-users', 'Failed to reset ticket window', {
        userId: variables.userId,
        ...getErrorLogDetails(error),
      });
    },
  });
}

export function useBanUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      reason,
      zeroRp,
    }: {
      userId: string;
      reason: string;
      zeroRp?: boolean;
    }) => adminUsersService.banUser(userId, { reason, zeroRp }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
    },
    onError: (error, variables) => {
      logger.error('admin-users', 'Failed to ban user', {
        userId: variables.userId,
        ...getErrorLogDetails(error),
      });
    },
  });
}

export function useUnbanUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId }: { userId: string }) => adminUsersService.unbanUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
    },
    onError: (error, variables) => {
      logger.error('admin-users', 'Failed to unban user', {
        userId: variables.userId,
        ...getErrorLogDetails(error),
      });
    },
  });
}

export function useResetLeaderboard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: LeaderboardResetBody) => adminUsersService.resetLeaderboard(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
    },
    onError: (error) => {
      logger.error('admin-users', 'Failed to reset leaderboard', getErrorLogDetails(error));
    },
  });
}
