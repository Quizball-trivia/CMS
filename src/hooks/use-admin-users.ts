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
