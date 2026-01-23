'use client';

import { useMemo } from 'react';
import { useCategories } from '@/hooks';
import type { Category } from '@/types';
import { DraggableCategoryCard } from './draggable-category-card';
import { RepositoryDropZone } from './repository-drop-zone';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface CategoryListProps {
  parentId?: string | null;
  onEditCategory?: (category: Category) => void;
  featuredCategoryIds?: Set<string>;
}

export function CategoryList({ parentId, onEditCategory, featuredCategoryIds = new Set() }: CategoryListProps) {
  const { data: categories, isLoading, error } = useCategories();

  // Group categories by parent
  const { rootCategories, childCounts } = useMemo(() => {
    if (!categories) return { rootCategories: [], childCounts: {} };

    const counts: Record<string, number> = {};
    const roots: Category[] = [];

    categories.forEach((cat) => {
      if (cat.parent_id) {
        counts[cat.parent_id] = (counts[cat.parent_id] || 0) + 1;
      }

      if (parentId === undefined) {
        // Show all root categories
        if (!cat.parent_id) {
          roots.push(cat);
        }
      } else if (parentId === null) {
        // Show root categories only
        if (!cat.parent_id) {
          roots.push(cat);
        }
      } else {
        // Show children of specific parent
        if (cat.parent_id === parentId) {
          roots.push(cat);
        }
      }
    });

    return { rootCategories: roots, childCounts: counts };
  }, [categories, parentId]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-w-full mx-auto">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="h-[240px] w-full bg-card/20 rounded-[2rem] animate-pulse border border-white/5"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-full">
        <AlertDescription>Failed to load categories. Please try again.</AlertDescription>
      </Alert>
    );
  }

  if (rootCategories.length === 0) {
    return (
      <div className="text-center py-20 max-w-full mx-auto bg-card/20 backdrop-blur-md rounded-2xl border border-white/5">
        <p className="text-muted-foreground font-medium italic">No categories available in the repository.</p>
      </div>
    );
  }

  return (
    <RepositoryDropZone>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-w-full mx-auto">
        {rootCategories.map((category) => (
          <DraggableCategoryCard
            key={category.id}
            category={category}
            isAlreadyFeatured={featuredCategoryIds.has(category.id)}
            onEdit={onEditCategory}
          />
        ))}
      </div>
    </RepositoryDropZone>
  );
}
