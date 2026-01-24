'use client';

import { type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';

interface FeaturedDropZoneProps {
  children: ReactNode;
  itemIds: string[];
}

export function FeaturedDropZone({ children, itemIds }: FeaturedDropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: 'featured-drop-zone',
    data: {
      droppableId: 'featured-drop-zone',
    },
  });

  return (
    <SortableContext items={itemIds} strategy={horizontalListSortingStrategy}>
      <div
        ref={setNodeRef}
        className={cn(
          "flex gap-3 pb-2 min-h-[200px] transition-all duration-200 rounded-2xl",
          isOver && "bg-primary/10 ring-2 ring-primary/30 ring-inset"
        )}
      >
        {children}
        {/* Drop indicator when empty or dragging over */}
        {itemIds.length === 0 && (
          <div className={cn(
            "flex-1 flex items-center justify-center text-muted-foreground text-sm border-2 border-dashed rounded-2xl min-h-[200px]",
            isOver ? "border-primary bg-primary/5" : "border-white/10"
          )}>
            {isOver ? 'Drop to add to featured' : 'Drag categories here to feature them'}
          </div>
        )}
      </div>
    </SortableContext>
  );
}
