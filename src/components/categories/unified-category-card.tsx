'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useDeleteCategory } from '@/hooks';
import { DEFAULT_LANGUAGE } from '@/lib/constants';
import type { Category } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GripVertical, Edit2, Trash2, X, Folder, Users, TrendingUp, Trophy, Star } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface UnifiedCategoryCardProps {
  category: Category;
  variant: 'repository' | 'featured';
  isDraggable?: boolean;
  dragHandleProps?: Record<string, unknown>;
  onEdit?: (category: Category) => void;
  onDelete?: (categoryId: string) => void;
  onRemoveFromFeatured?: (featuredId: string) => void;
  featuredId?: string;
  isAlreadyFeatured?: boolean;
  isDragging?: boolean;
}

export function UnifiedCategoryCard({
  category,
  variant,
  isDraggable = false,
  dragHandleProps,
  onEdit,
  onRemoveFromFeatured,
  featuredId,
  isAlreadyFeatured = false,
  isDragging = false,
}: UnifiedCategoryCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const deleteCategory = useDeleteCategory();

  const name = category.name[DEFAULT_LANGUAGE] || Object.values(category.name)[0] || 'Untitled';
  const description = category.description?.[DEFAULT_LANGUAGE] || Object.values(category.description || {})[0] || 'Experience the ultimate challenge in this category.';

  const handleDelete = async () => {
    try {
      await deleteCategory.mutateAsync(category.id);
      toast.success('Category deleted successfully');
      setShowDeleteDialog(false);
    } catch {
      toast.error('Failed to delete category');
    }
  };

  const handleRemoveFromFeatured = () => {
    if (onRemoveFromFeatured && featuredId) {
      onRemoveFromFeatured(featuredId);
    }
  };

  const isRepository = variant === 'repository';
  const isFeatured = variant === 'featured';

  return (
    <>
      <Card
        className={cn(
          "relative flex min-h-[240px] w-full flex-col overflow-hidden border border-white/10 bg-[#0a0a0a] rounded-[2rem]",
          isDragging && "opacity-50 scale-95 z-50",
          isFeatured && "h-[240px] w-[400px] flex-shrink-0"
        )}
      >
        {/* Already Featured Badge - only show on repository cards */}
        {isRepository && isAlreadyFeatured && (
          <div className="absolute top-4 right-4 z-20 px-2 py-1 bg-primary/80 text-white text-xs font-bold rounded-full">
            Featured
          </div>
        )}

        {/* Background Layer */}
        <div className="absolute inset-0 z-0">
          {category.image_url ? (
            <>
              <img
                src={category.image_url}
                alt=""
                className="h-full w-full object-cover"
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
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-xl">
              {category.icon ? (
                <span className="text-3xl leading-none" role="img" aria-label="category icon">{category.icon}</span>
              ) : isFeatured ? (
                <Star className="h-6 w-6 text-primary" />
              ) : (
                <Folder className="h-6 w-6 text-primary" />
              )}
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2 bg-[#22c55e] text-white px-3 py-1.5 rounded-lg shadow-lg">
                <Trophy className="w-4 h-4" />
                <span className="text-xs font-black tracking-tighter">#52</span>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {/* Drag Handle */}
                {isDraggable && (
                  <div
                    {...dragHandleProps}
                    className={cn(
                      "cursor-grab active:cursor-grabbing p-2 bg-black/20 backdrop-blur-md border border-white/10 rounded-full text-white/50 hover:text-white transition-all",
                      isAlreadyFeatured && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <GripVertical className="w-4 h-4" />
                  </div>
                )}

                {/* Edit Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-white/50 hover:text-primary hover:bg-primary/20 transition-all"
                  onClick={() => onEdit?.(category)}
                >
                  <Edit2 className="w-4 h-4" />
                </Button>

                {/* Delete/Remove Button */}
                {isFeatured ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-white/50 hover:text-red-400 hover:bg-red-500/20 transition-all"
                    onClick={handleRemoveFromFeatured}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-white/50 hover:text-red-400 hover:bg-red-500/20 transition-all"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Row */}
          <div className="flex items-end justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-2xl font-black tracking-tight text-white truncate drop-shadow-md">
                {name}
              </h3>
              <p className="mt-1 text-sm text-white/70 line-clamp-1 font-medium max-w-[80%]">
                {description}
              </p>

              <div className="mt-4 flex items-center gap-3">
                <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full shadow-lg" title="Total Players">
                  <Users className="w-3.5 h-3.5 text-white/60" />
                  <span className="text-xs font-bold text-white tracking-tight">24.8k</span>
                </div>
                <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full shadow-lg" title="Popularity Score">
                  <TrendingUp className="w-3.5 h-3.5 text-white/60" />
                  <span className="text-xs font-bold text-white tracking-tight">2450</span>
                </div>
              </div>
            </div>

            {/* Hidden Status Indicator (Visual only for Admin) */}
            <div className={cn(
              "absolute top-4 left-4 h-2 w-2 rounded-full",
              category.is_active ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-slate-400"
            )} />
          </div>
        </div>
      </Card>

      {/* Delete Confirmation Dialog - only for repository cards */}
      {isRepository && (
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Category</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &quot;{name}&quot;? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteCategory.isPending}
              >
                {deleteCategory.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
