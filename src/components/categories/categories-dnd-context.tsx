'use client';

import { useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import type { Category, FeaturedCategory } from '@/types';
import { UnifiedCategoryCard } from './unified-category-card';

export interface DragData {
  source: 'repository' | 'featured';
  category: Category;
  featuredId?: string;
}

interface CategoriesDndContextProps {
  children: ReactNode;
  featuredItems: FeaturedCategory[];
  onAddToFeatured: (categoryId: string) => Promise<void>;
  onRemoveFromFeatured: (featuredId: string) => Promise<void>;
  onReorderFeatured: (items: Array<{ id: string; sort_order: number }>) => Promise<void>;
  onFeaturedItemsChange: (items: FeaturedCategory[]) => void;
}

export function CategoriesDndContext({
  children,
  featuredItems,
  onAddToFeatured,
  onRemoveFromFeatured,
  onReorderFeatured,
  onFeaturedItemsChange,
}: CategoriesDndContextProps) {
  const [activeData, setActiveData] = useState<DragData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (data) {
      setActiveData(data);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveData(null);

    if (!over) return;

    const activeDataCurrent = active.data.current as DragData | undefined;
    const overDataCurrent = over.data.current as DragData | { droppableId: string } | undefined;

    if (!activeDataCurrent) return;

    const isFromRepository = activeDataCurrent.source === 'repository';
    const isFromFeatured = activeDataCurrent.source === 'featured';

    // Determine if dropping on featured zone
    const isOverFeaturedZone = over.id === 'featured-drop-zone' ||
      (overDataCurrent && 'source' in overDataCurrent && overDataCurrent.source === 'featured');

    // Determine if dropping on repository zone
    const isOverRepositoryZone = over.id === 'repository-drop-zone' ||
      (overDataCurrent && 'source' in overDataCurrent && overDataCurrent.source === 'repository');

    if (isFromRepository && isOverFeaturedZone) {
      // Repository → Featured = ADD to featured table
      await onAddToFeatured(activeDataCurrent.category.id);
    } else if (isFromFeatured && isOverRepositoryZone) {
      // Featured → Repository = REMOVE from featured table
      if (activeDataCurrent.featuredId) {
        await onRemoveFromFeatured(activeDataCurrent.featuredId);
      }
    } else if (isFromFeatured && isOverFeaturedZone && active.id !== over.id) {
      // Within Featured = REORDER
      const oldIndex = featuredItems.findIndex((item) => item.id === active.id);
      const newIndex = featuredItems.findIndex((item) => item.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newItems = arrayMove(featuredItems, oldIndex, newIndex);
        onFeaturedItemsChange(newItems);

        // Persist order to server
        await onReorderFeatured(
          newItems.map((item, index) => ({
            id: item.id,
            sort_order: index,
          }))
        );
      }
    }
  };

  const handleDragCancel = () => {
    setActiveData(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children}

      {/* Drag Overlay - shows the card being dragged */}
      <DragOverlay>
        {activeData ? (
          <div className="opacity-90">
            <UnifiedCategoryCard
              category={activeData.category}
              variant={activeData.source}
              isDragging
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
