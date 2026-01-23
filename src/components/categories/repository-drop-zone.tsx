'use client';

import { type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';

interface RepositoryDropZoneProps {
  children: ReactNode;
}

export function RepositoryDropZone({ children }: RepositoryDropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: 'repository-drop-zone',
    data: {
      droppableId: 'repository-drop-zone',
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "transition-all duration-200 rounded-2xl p-1 -m-1",
        isOver && "bg-orange-500/10 ring-2 ring-orange-500/30 ring-inset"
      )}
    >
      {children}
      {isOver && (
        <div className="mt-4 text-center py-4 text-orange-400 text-sm font-medium animate-pulse">
          Drop here to remove from featured
        </div>
      )}
    </div>
  );
}
