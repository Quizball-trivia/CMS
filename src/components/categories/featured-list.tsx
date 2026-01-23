'use client';

import type { FeaturedCategory, Category } from '@/types';
import { SortableFeaturedCard } from './sortable-featured-card';
import { FeaturedDropZone } from './featured-drop-zone';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface FeaturedListProps {
  items: FeaturedCategory[];
  isLoading: boolean;
  error: Error | null;
  onEditCategory?: (category: Category) => void;
  onRemoveFromFeatured?: (featuredId: string) => void;
}

export function FeaturedList({
  items,
  isLoading,
  error,
  onEditCategory,
  onRemoveFromFeatured,
}: FeaturedListProps) {
  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="w-[400px] h-[240px] bg-card/20 rounded-[2rem] animate-pulse flex-shrink-0 border border-white/5" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load featured categories.</AlertDescription>
      </Alert>
    );
  }

  return (
    <FeaturedDropZone itemIds={items.map((i) => i.id)}>
      {items.map((item) => (
        <SortableFeaturedCard
          key={item.id}
          featured={item}
          onEdit={onEditCategory}
          onRemoveFromFeatured={onRemoveFromFeatured}
        />
      ))}
    </FeaturedDropZone>
  );
}
