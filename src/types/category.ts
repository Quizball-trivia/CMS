import type { components } from './api.generated';

// Re-export from generated types - these stay in sync with backend automatically
export type I18nField = components['schemas']['I18nField'];
export type Category = components['schemas']['CategoryResponse'];
export type PaginatedCategoriesResponse = components['schemas']['PaginatedCategoriesResponse'];

// Request types derived from backend (for create/update)
export interface CreateCategoryRequest {
  slug: string;
  parent_id?: string | null;
  name: I18nField;
  description?: I18nField | null;
  icon?: string | null;
  image_url?: string | null;
  is_active?: boolean;
}

export interface UpdateCategoryRequest {
  slug?: string;
  parent_id?: string | null;
  name?: I18nField;
  description?: I18nField | null;
  icon?: string | null;
  image_url?: string | null;
  is_active?: boolean;
}

export interface ListCategoriesParams {
  parent_id?: string;
  is_active?: string;
  page?: number;
  limit?: number;
}

// Featured categories - now from generated types
export type FeaturedCategory = components['schemas']['FeaturedCategoryResponse'];

export interface CreateFeaturedCategoryRequest {
  category_id: string;
  sort_order?: number;
}

export interface UpdateFeaturedCategoryRequest {
  sort_order: number;
}

export interface ReorderFeaturedCategoriesRequest {
  items: Array<{
    id: string;
    sort_order: number;
  }>;
}

// Category dependencies for delete modal
export interface CategoryDependencies {
  children: { id: string; name: I18nField; slug: string }[];
  questions: { id: string; prompt: I18nField; type: string; difficulty: string }[];
  featured: boolean;
}

export interface DeleteCategoryResult {
  action: 'deleted' | 'archived';
  entity_type: 'category';
  entity_id: string;
  message: string;
  archived_questions?: number;
}
