import { apiClient } from './api-client';
import type {
  FeaturedCategory,
  CreateFeaturedCategoryRequest,
  UpdateFeaturedCategoryRequest,
  ReorderFeaturedCategoriesRequest,
} from '@/types';

export const featuredService = {
  async list(): Promise<FeaturedCategory[]> {
    return apiClient.get<FeaturedCategory[]>('/featured-categories');
  },

  async getById(id: string): Promise<FeaturedCategory> {
    return apiClient.get<FeaturedCategory>(`/featured-categories/${id}`);
  },

  async create(data: CreateFeaturedCategoryRequest): Promise<FeaturedCategory> {
    return apiClient.post<FeaturedCategory>('/featured-categories', data);
  },

  async update(id: string, data: UpdateFeaturedCategoryRequest): Promise<FeaturedCategory> {
    return apiClient.put<FeaturedCategory>(`/featured-categories/${id}`, data);
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/featured-categories/${id}`);
  },

  async reorder(data: ReorderFeaturedCategoriesRequest): Promise<FeaturedCategory[]> {
    return apiClient.put<FeaturedCategory[]>('/featured-categories/reorder', data);
  },
};
