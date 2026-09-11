import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoriesService } from '@/services';
import type {
  CreateCategoryRequest,
  UpdateCategoryRequest,
  ListCategoriesParams,
  FeaturedCategory,
} from '@/types';
import { featuredKeys } from './use-featured';
import { logger } from '@/lib/logger';
import { getErrorLogDetails } from '@/lib/error-feedback';

export const categoryKeys = {
  all: ['categories'] as const,
  lists: () => [...categoryKeys.all, 'list'] as const,
  list: (params?: ListCategoriesParams) => [...categoryKeys.lists(), params] as const,
  details: () => [...categoryKeys.all, 'detail'] as const,
  detail: (id: string) => [...categoryKeys.details(), id] as const,
};

export function useCategories(params?: Omit<ListCategoriesParams, 'page' | 'limit'>) {
  return useQuery({
    queryKey: categoryKeys.list(params),
    queryFn: () => categoriesService.listAll(params),
  });
}

export function useCategory(id: string) {
  return useQuery({
    queryKey: categoryKeys.detail(id),
    queryFn: () => categoriesService.getById(id),
    enabled: !!id,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCategoryRequest) => categoriesService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all });
    },
    onError: (error) => {
      logger.error('categories', 'Failed to create category', getErrorLogDetails(error));
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCategoryRequest }) =>
      categoriesService.update(id, data),
    onSuccess: (updatedCategory, variables) => {
      // Update the detail cache
      queryClient.setQueryData(categoryKeys.detail(variables.id), updatedCategory);
      
      queryClient.setQueriesData<typeof updatedCategory[]>(
        { queryKey: categoryKeys.lists() },
        (old) => old?.map((category) => category.id === variables.id ? updatedCategory : category)
      );

      // Refetch filtered lists: changing parent/active status can add or remove
      // a category from a cached result, which an in-place replacement cannot do.
      void queryClient.invalidateQueries({ queryKey: categoryKeys.lists() });

      // Also update featured categories cache (they contain nested category data)
      queryClient.setQueriesData<FeaturedCategory[]>(
        { queryKey: featuredKeys.list() },
        (old) => {
          if (!old) return old;
          return old.map((featured) =>
            featured.category.id === variables.id
              ? { ...featured, category: { ...featured.category, ...updatedCategory } }
              : featured
          );
        }
      );
    },
    onError: (error, variables) => {
      logger.error('categories', 'Failed to update category', {
        id: variables.id,
        ...getErrorLogDetails(error),
      });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => categoriesService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all });
    },
    onError: (error, id) => {
      logger.error('categories', 'Failed to delete category', {
        id,
        ...getErrorLogDetails(error),
      });
    },
  });
}

export function useCategoryDependencies(id: string, enabled = true) {
  return useQuery({
    queryKey: [...categoryKeys.detail(id), 'dependencies'] as const,
    staleTime: 0,
    queryFn: () => categoriesService.getDependencies(id),
    enabled: enabled && !!id,
  });
}

export function useCascadeDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => categoriesService.deleteWithCascade(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all });
    },
    onError: (error, id) => {
      logger.error('categories', 'Failed to cascade-delete category', {
        id,
        ...getErrorLogDetails(error),
      });
    },
  });
}
