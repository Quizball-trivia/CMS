import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { featuredService } from '@/services';
import type {
  CreateFeaturedCategoryRequest,
  UpdateFeaturedCategoryRequest,
  ReorderFeaturedCategoriesRequest,
} from '@/types';

export const featuredKeys = {
  all: ['featured-categories'] as const,
  list: () => [...featuredKeys.all, 'list'] as const,
  details: () => [...featuredKeys.all, 'detail'] as const,
  detail: (id: string) => [...featuredKeys.details(), id] as const,
};

export function useFeaturedCategories() {
  return useQuery({
    queryKey: featuredKeys.list(),
    queryFn: () => featuredService.list(),
  });
}

export function useFeaturedCategory(id: string) {
  return useQuery({
    queryKey: featuredKeys.detail(id),
    queryFn: () => featuredService.getById(id),
    enabled: !!id,
  });
}

export function useCreateFeaturedCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateFeaturedCategoryRequest) => featuredService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: featuredKeys.all });
    },
  });
}

export function useUpdateFeaturedCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateFeaturedCategoryRequest }) =>
      featuredService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: featuredKeys.all });
    },
  });
}

export function useDeleteFeaturedCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => featuredService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: featuredKeys.all });
    },
  });
}

export function useReorderFeaturedCategories() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ReorderFeaturedCategoriesRequest) => featuredService.reorder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: featuredKeys.all });
    },
  });
}
