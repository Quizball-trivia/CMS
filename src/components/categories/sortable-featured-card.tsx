'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Category, FeaturedCategory } from '@/types';
import { UnifiedCategoryCard } from './unified-category-card';
import type { DragData } from './categories-dnd-context';

interface SortableFeaturedCardProps {
  featured: FeaturedCategory;
  onEdit?: (category: Category) => void;
  onRemoveFromFeatured?: (featuredId: string) => void;
}

export function SortableFeaturedCard({
  featured,
  onEdit,
  onRemoveFromFeatured,
}: SortableFeaturedCardProps) {
  // Convert featured category data to full Category type
  const category: Category = {
    id: featured.category.id,
    slug: featured.category.slug,
    parent_id: null,
    name: featured.category.name,
    description: featured.category.description,
    icon: featured.category.icon,
    image_url: featured.category.image_url,
    is_active: featured.category.is_active,
    created_at: featured.created_at,
    updated_at: featured.created_at,
  };

  const dragData: DragData = {
    source: 'featured',
    category,
    featuredId: featured.id,
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: featured.id,
    data: dragData,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex-shrink-0">
      <UnifiedCategoryCard
        category={category}
        variant="featured"
        isDraggable
        dragHandleProps={{ ...attributes, ...listeners }}
        onEdit={onEdit}
        onRemoveFromFeatured={onRemoveFromFeatured}
        featuredId={featured.id}
        isDragging={isDragging}
      />
    </div>
  );
}
