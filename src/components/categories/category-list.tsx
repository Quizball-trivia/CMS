'use client';

import { useMemo } from 'react';
import { useCategories } from '@/hooks';
import type { Category } from '@/types';
import { DraggableCategoryCard } from './draggable-category-card';
import { RepositoryDropZone } from './repository-drop-zone';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DEFAULT_LANGUAGE } from '@/lib/constants';

interface CategoryListProps {
  onEditCategory?: (category: Category) => void;
  featuredCategoryIds?: Set<string>;
}

export function CategoryList({ onEditCategory, featuredCategoryIds = new Set() }: CategoryListProps) {
  const { data: categories, isLoading, error } = useCategories();

  // Build parent name map and sort categories (parents first, then children)
  const { sortedCategories, parentNames } = useMemo(() => {
    if (!categories) return { sortedCategories: [], parentNames: {} };

    // Build a map of category ID to name for parent lookups
    const nameMap: Record<string, string> = {};
    categories.forEach((cat) => {
      nameMap[cat.id] = cat.name[DEFAULT_LANGUAGE] || cat.slug;
    });

    // Sort: root categories first, then children grouped by parent
    const sorted = [...categories].sort((a, b) => {
      // Root categories come first
      if (!a.parent_id && b.parent_id) return -1;
      if (a.parent_id && !b.parent_id) return 1;

      // Among roots or among children with same parent, sort by name
      if (a.parent_id === b.parent_id) {
        const nameA = a.name[DEFAULT_LANGUAGE] || a.slug;
        const nameB = b.name[DEFAULT_LANGUAGE] || b.slug;
        return nameA.localeCompare(nameB);
      }

      // Group children under their parent
      const parentNameA = a.parent_id ? nameMap[a.parent_id] || '' : '';
      const parentNameB = b.parent_id ? nameMap[b.parent_id] || '' : '';
      return parentNameA.localeCompare(parentNameB);
    });

    return { sortedCategories: sorted, parentNames: nameMap };
  }, [categories]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="h-[190px] w-full bg-card/20 rounded-2xl animate-pulse border border-white/5"
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

  if (sortedCategories.length === 0) {
    return (
      <div className="text-center py-20 max-w-full mx-auto bg-card/20 backdrop-blur-md rounded-2xl border border-white/5">
        <p className="text-muted-foreground font-medium italic">No categories available.</p>
      </div>
    );
  }

  return (
    <RepositoryDropZone>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
        {sortedCategories.map((category) => (
          <DraggableCategoryCard
            key={category.id}
            category={category}
            isAlreadyFeatured={featuredCategoryIds.has(category.id)}
            onEdit={onEditCategory}
            parentName={category.parent_id ? parentNames[category.parent_id] : undefined}
          />
        ))}
      </div>
    </RepositoryDropZone>
  );
}
