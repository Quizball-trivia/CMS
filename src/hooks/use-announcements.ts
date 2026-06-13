import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { announcementsService } from '@/services';
import type { CreateAnnouncementRequest, UpdateAnnouncementRequest } from '@/types';
import { logger } from '@/lib/logger';
import { getErrorLogDetails } from '@/lib/error-feedback';

export const announcementKeys = {
  all: ['announcements'] as const,
  lists: () => [...announcementKeys.all, 'list'] as const,
};

export function useAnnouncements() {
  return useQuery({
    queryKey: announcementKeys.lists(),
    queryFn: () => announcementsService.list(),
  });
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAnnouncementRequest) => announcementsService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: announcementKeys.all });
    },
    onError: (error) => {
      logger.error('announcements', 'Failed to create announcement', getErrorLogDetails(error));
    },
  });
}

export function useUpdateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAnnouncementRequest }) =>
      announcementsService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: announcementKeys.all });
    },
    onError: (error) => {
      logger.error('announcements', 'Failed to update announcement', getErrorLogDetails(error));
    },
  });
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => announcementsService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: announcementKeys.all });
    },
    onError: (error) => {
      logger.error('announcements', 'Failed to delete announcement', getErrorLogDetails(error));
    },
  });
}
