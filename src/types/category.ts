export interface I18nField {
  [languageCode: string]: string;
}

export interface Category {
  id: string;
  slug: string;
  parent_id: string | null;
  name: I18nField;
  description: I18nField | null;
  icon: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

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
  is_active?: boolean;
}

export interface FeaturedCategory {
  id: string;
  category_id: string;
  sort_order: number;
  created_at: string;
  category: {
    id: string;
    slug: string;
    parent_id: string | null;
    name: I18nField;
    description: I18nField | null;
    icon: string | null;
    image_url: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };
}

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
