import { useQuery } from '@tanstack/react-query';
import { activityService } from '@/services';

export const activityKeys = {
  all: ['activity'] as const,
  activity: (params: { from: string; to: string; user_id: string }) =>
    [...activityKeys.all, 'daily', params] as const,
  users: () => [...activityKeys.all, 'users'] as const,
  byCategory: (userId: string) => [...activityKeys.all, 'by-category', userId] as const,
  recent: (userId: string) => [...activityKeys.all, 'recent', userId] as const,
};

export function useActivity(params: { from: string; to: string; user_id: string }) {
  return useQuery({
    queryKey: activityKeys.activity(params),
    queryFn: () => activityService.getActivity(params),
    enabled: !!params.user_id,
  });
}

export function useActivityUsers() {
  return useQuery({
    queryKey: activityKeys.users(),
    queryFn: () => activityService.getUsers(),
  });
}

export function useActivityByCategory(userId: string) {
  return useQuery({
    queryKey: activityKeys.byCategory(userId),
    queryFn: () => activityService.getByCategory(userId),
    enabled: !!userId,
  });
}

export function useRecentActivity(userId: string) {
  return useQuery({
    queryKey: activityKeys.recent(userId),
    queryFn: () => activityService.getRecent(userId),
    enabled: !!userId,
  });
}
