'use client';

import { useState, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import {
  useFeaturedCategories,
  useDeleteFeaturedCategory,
  useReorderFeaturedCategories,
} from '@/hooks';
import { DEFAULT_LANGUAGE } from '@/lib/constants';
import type { FeaturedCategory } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { X, GripVertical, Star, Users, TrendingUp, Trophy, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Category } from '@/types';

interface SortableItemProps {
  featured: FeaturedCategory;
  onRemove: (id: string) => void;
  onEdit: (category: Category) => void;
  isRemoving: boolean;
}

function SortableItem({ featured, onRemove, onEdit, isRemoving }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: featured.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const name = featured.category.name[DEFAULT_LANGUAGE] || Object.values(featured.category.name)[0] || 'Untitled';
  const description = featured.category.description?.[DEFAULT_LANGUAGE] || Object.values(featured.category.description || {})[0] || 'Experience the ultimate challenge in this category.';

  return (
    <div ref={setNodeRef} style={style} className="flex-shrink-0 group">
      <Card
        className={cn(
          "relative flex h-[220px] w-[400px] flex-col overflow-hidden border border-white/10 bg-[#0a0a0a] transition-all duration-300 hover:shadow-2xl hover:shadow-primary/20 rounded-[2rem]",
          isDragging ? "opacity-50 scale-95 z-50" : "opacity-100"
        )}
      >
        {/* Background Layer */}
        <div className="absolute inset-0 z-0">
          {featured.category.image_url ? (
            <>
              <img 
                src={featured.category.image_url} 
                alt="" 
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />
            </>
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-primary/20 via-primary/5 to-black" />
          )}
        </div>

        <div className="relative z-10 flex h-full flex-col p-5 justify-between">
          {/* Top Row */}
          <div className="flex items-start justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-xl transition-transform duration-300 group-hover:scale-110">
              {featured.category.icon ? (
                <span className="text-2xl leading-none">{featured.category.icon}</span>
              ) : (
                <Star className="w-5 h-5 text-primary" />
              )}
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2 bg-[#22c55e] text-white px-3 py-1.5 rounded-lg shadow-lg">
                <Trophy className="w-4 h-4" />
                <span className="text-xs font-black tracking-tighter">#52</span>
              </div>
              
              <div className="flex items-center gap-1">
                <div
                  {...attributes}
                  {...listeners}
                  className="cursor-grab active:cursor-grabbing p-2 bg-black/20 backdrop-blur-md border border-white/10 rounded-full text-white/50 hover:text-white transition-all"
                >
                  <GripVertical className="w-4 h-4" />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-white/50 hover:text-primary hover:bg-primary/20 transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Convert featured category to full Category type for editing
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
                    onEdit(category);
                  }}
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-white/50 hover:text-red-400 hover:bg-red-500/20 transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(featured.id);
                  }}
                  disabled={isRemoving}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Bottom Row */}
          <div className="flex items-end justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-black tracking-tight text-white truncate drop-shadow-md group-hover:text-primary transition-colors">
                {name}
              </h3>
              <p className="mt-0.5 text-xs text-white/70 line-clamp-1 font-medium max-w-[85%]">
                {description}
              </p>
              
              <div className="mt-4 flex items-center gap-3">
                <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full shadow-lg transition-transform hover:scale-105">
                  <Users className="w-3.5 h-3.5 text-white/60" />
                  <span className="text-xs font-bold text-white tracking-tight">24.8k</span>
                </div>
                <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full shadow-lg transition-transform hover:scale-105">
                  <TrendingUp className="w-3.5 h-3.5 text-white/60" />
                  <span className="text-xs font-bold text-white tracking-tight">2450</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

interface FeaturedListProps {
  onEditCategory?: (category: Category) => void;
}

export function FeaturedList({ onEditCategory }: FeaturedListProps) {
  const { data: featured, isLoading, error } = useFeaturedCategories();
  const deleteFeatured = useDeleteFeaturedCategory();
  const reorderFeatured = useReorderFeaturedCategories();
  const [items, setItems] = useState<FeaturedCategory[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Sync items with server data
  if (featured && items.length === 0 && featured.length > 0) {
    setItems(featured);
  }

  // Update items when server data changes
  if (featured && JSON.stringify(featured.map((f) => f.id)) !== JSON.stringify(items.map((f) => f.id))) {
    setItems(featured);
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);

      const newItems = arrayMove(items, oldIndex, newIndex);
      setItems(newItems);

      // Update sort_order on server
      try {
        await reorderFeatured.mutateAsync({
          items: newItems.map((item, index) => ({
            id: item.id,
            sort_order: index,
          })),
        });
        toast.success('Featured categories reordered');
      } catch {
        // Revert on error
        setItems(featured || []);
        toast.error('Failed to reorder categories');
      }
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await deleteFeatured.mutateAsync(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      toast.success('Removed from featured');
    } catch {
      toast.error('Failed to remove from featured');
    }
  };

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="w-48 h-20 bg-gray-100 rounded-lg animate-pulse flex-shrink-0" />
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

  if (items.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500 text-sm">
        No featured categories. Add categories to feature them here.
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {items.map((item) => (
            <SortableItem
              key={item.id}
              featured={item}
              onRemove={handleRemove}
              onEdit={onEditCategory || (() => {})}
              isRemoving={deleteFeatured.isPending}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
