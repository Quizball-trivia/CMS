import { apiClient } from './api-client';
import type {
  Announcement,
  CreateAnnouncementRequest,
  UpdateAnnouncementRequest,
  ListAnnouncementsResponse,
} from '@/types';

// Admin announcement management. Paths are relative to API_BASE_URL (which
// already includes /api/v1), so these hit /api/v1/admin/announcements.
export const announcementsService = {
  async list(): Promise<Announcement[]> {
    const response = await apiClient.get<ListAnnouncementsResponse>('/admin/announcements');
    return response.items;
  },

  async create(data: CreateAnnouncementRequest): Promise<Announcement> {
    return apiClient.post<Announcement>('/admin/announcements', data);
  },

  async update(id: string, data: UpdateAnnouncementRequest): Promise<Announcement> {
    return apiClient.patch<Announcement>(`/admin/announcements/${id}`, data);
  },

  async remove(id: string): Promise<void> {
    return apiClient.delete<void>(`/admin/announcements/${id}`);
  },
};
