'use client';

import { useDraggable } from '@dnd-kit/core';
import type { Category } from '@/types';
import { UnifiedCategoryCard } from './unified-category-card';
import type { DragData } from './categories-dnd-context';

interface DraggableCategoryCardProps {
  category: Category;
  isAlreadyFeatured: boolean;
  onEdit?: (category: Category) => void;
  parentName?: string;
}

export function DraggableCategoryCard({
  category,
  isAlreadyFeatured,
  onEdit,
  parentName,
}: DraggableCategoryCardProps) {
  const dragData: DragData = {
    source: 'repository',
    category,
  };

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `repository-${category.id}`,
    data: dragData,
    disabled: isAlreadyFeatured,
  });

  return (
    <div ref={setNodeRef} className={isDragging ? 'opacity-50' : ''}>
      <UnifiedCategoryCard
        category={category}
        variant="repository"
        isDraggable={!isAlreadyFeatured}
        dragHandleProps={{ ...attributes, ...listeners }}
        onEdit={onEdit}
        isAlreadyFeatured={isAlreadyFeatured}
        isDragging={isDragging}
        parentName={parentName}
      />
    </div>
  );
}
