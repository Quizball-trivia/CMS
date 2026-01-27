'use client';

import { useMemo } from 'react';
import { useCategories } from '@/hooks';
import type { Category } from '@/types';
import { DraggableCategoryCard } from './draggable-category-card';
import { RepositoryDropZone } from './repository-drop-zone';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getLocalizedText } from '@/lib/utils';
import { SearchX } from 'lucide-react';

interface CategoryListProps {
  onEditCategory?: (category: Category) => void;
  featuredCategoryIds?: Set<string>;
  searchTerm?: string;
}

export function CategoryList({ 
  onEditCategory, 
  featuredCategoryIds = new Set(),
  searchTerm = ''
}: CategoryListProps) {
  const { data: categories, isLoading, error } = useCategories();

  // Build parent name map and filter/sort categories
  const { filteredCategories, parentNames } = useMemo(() => {
    if (!categories) return { filteredCategories: [], parentNames: {} };

    // Build a map of category ID to name for parent lookups
    const nameMap: Record<string, string> = {};
    categories.forEach((cat) => {
      nameMap[cat.id] = getLocalizedText(cat.name, cat.slug);
    });

    // Filter by search term
    const normalizedSearch = searchTerm.toLowerCase().trim();
    const filtered = categories.filter((cat) => {
      if (!normalizedSearch) return true;
      
      const nameEn = cat.name.en?.toLowerCase() || '';
      const nameKa = cat.name.ka?.toLowerCase() || '';
      const slug = cat.slug.toLowerCase();
      
      return nameEn.includes(normalizedSearch) || 
             nameKa.includes(normalizedSearch) || 
             slug.includes(normalizedSearch);
    });

    // Sort: root categories first, then children grouped by parent
    const sorted = [...filtered].sort((a, b) => {
      // Root categories come first
      if (!a.parent_id && b.parent_id) return -1;
      if (a.parent_id && !b.parent_id) return 1;

      // Among roots or among children with same parent, sort by name
      if (a.parent_id === b.parent_id) {
        const nameA = getLocalizedText(a.name, a.slug);
        const nameB = getLocalizedText(b.name, b.slug);
        return nameA.localeCompare(nameB);
      }

      // Group children under their parent
      const parentNameA = a.parent_id ? nameMap[a.parent_id] || '' : '';
      const parentNameB = b.parent_id ? nameMap[b.parent_id] || '' : '';
      return parentNameA.localeCompare(parentNameB);
    });

    return { filteredCategories: sorted, parentNames: nameMap };
  }, [categories, searchTerm]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="h-[200px] w-full bg-gray-100 rounded-[2rem] animate-pulse border border-gray-200/50"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-full rounded-2xl border-red-100 bg-red-50 text-red-600">
        <AlertDescription>Failed to load categories. Please try again.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <RepositoryDropZone>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredCategories.map((category) => (
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
      
      {filteredCategories.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-gray-100/50 rounded-[2.5rem] border border-dashed border-gray-200">
          <div className="p-4 bg-white rounded-full shadow-sm mb-4">
            <SearchX className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-gray-500 font-bold tracking-tight">No categories found</p>
          <p className="text-gray-400 text-sm mt-1">Try searching for something else</p>
        </div>
      )}
    </div>
  );
}
