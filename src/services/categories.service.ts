import { apiClient } from './api-client';
import type {
  Category,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  ListCategoriesParams,
  CategoryDependencies,
  PaginatedCategoriesResponse,
  DeleteCategoryResult,
} from '@/types';

export const categoriesService = {
  async list(params?: ListCategoriesParams): Promise<Category[]> {
    const response = await apiClient.get<PaginatedCategoriesResponse>(
      '/categories',
      params as Record<string, string | number | boolean | undefined>
    );
    return response.data;
  },

  // Fetches every category across all pages. The backend caps `limit` at 100,
  // so the CMS must page through rather than assume one request returns all of
  // them — otherwise categories past the first page silently disappear from the
  // grid, dropdowns, and question forms.
  async listAll(params?: Omit<ListCategoriesParams, 'page' | 'limit'>): Promise<Category[]> {
    const limit = 100;
    const first = await apiClient.get<PaginatedCategoriesResponse>(
      '/categories',
      { ...params, page: 1, limit } as Record<string, string | number | boolean | undefined>
    );

    if (first.total_pages <= 1) {
      return first.data;
    }

    const remaining = await Promise.all(
      Array.from({ length: first.total_pages - 1 }, (_, i) =>
        apiClient.get<PaginatedCategoriesResponse>(
          '/categories',
          { ...params, page: i + 2, limit } as Record<string, string | number | boolean | undefined>
        )
      )
    );

    return [first.data, ...remaining.map((r) => r.data)].flat();
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

  async delete(id: string): Promise<DeleteCategoryResult> {
    return apiClient.delete<DeleteCategoryResult>(`/categories/${id}`);
  },

  async getDependencies(id: string): Promise<CategoryDependencies> {
    return apiClient.get<CategoryDependencies>(`/categories/${id}/dependencies`);
  },

  async deleteWithCascade(id: string): Promise<DeleteCategoryResult> {
    return apiClient.delete<DeleteCategoryResult>(`/categories/${id}?cascade=true`);
  },
};
