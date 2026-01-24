import { apiClient } from './api-client';
import type {
  Category,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  ListCategoriesParams,
  CategoryDependencies,
} from '@/types';

export const categoriesService = {
  async list(params?: ListCategoriesParams): Promise<Category[]> {
    return apiClient.get<Category[]>('/categories', params as Record<string, string | number | boolean | undefined>);
  },

  async getById(id: string): Promise<Category> {
    return apiClient.get<Category>(`/categories/${id}`);
  },

  async create(data: CreateCategoryRequest): Promise<Category> {
    return apiClient.post<Category>('/categories', data);
  },

  async update(id: string, data: UpdateCategoryRequest): Promise<Category> {
    return apiClient.put<Category>(`/categories/${id}`, data);
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/categories/${id}`);
  },

  async getDependencies(id: string): Promise<CategoryDependencies> {
    return apiClient.get<CategoryDependencies>(`/categories/${id}/dependencies`);
  },

  async deleteWithCascade(id: string): Promise<void> {
    return apiClient.delete<void>(`/categories/${id}?cascade=true`);
  },
};
