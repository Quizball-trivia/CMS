'use client';

import { useState } from 'react';
import { DEFAULT_LANGUAGE } from '@/lib/constants';
import type { Category } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GripVertical, Edit2, Trash2, X, Folder, Star, Users, TrendingUp, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CategoryDeleteModal } from './category-delete-modal';

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
  parentName?: string;
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
  parentName,
}: UnifiedCategoryCardProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const name = category.name[DEFAULT_LANGUAGE] || Object.values(category.name)[0] || 'Untitled';
  const description = category.description?.[DEFAULT_LANGUAGE] || Object.values(category.description || {})[0] || '';

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
          "relative flex flex-col overflow-hidden border border-white/10 bg-[#0a0a0a] rounded-2xl",
          isDragging && "opacity-50 scale-95 z-50",
          isFeatured && "h-[200px] w-[300px] flex-shrink-0",
          isRepository && "h-[190px] w-full"
        )}
      >

        {/* Background Layer */}
        <div className="absolute inset-0 z-0">
          {category.image_url ? (
            <>
              <img
                src={category.image_url}
                alt=""
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/20" />
            </>
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-primary/20 via-primary/5 to-black" />
          )}
        </div>

        <div className="relative z-10 flex h-full flex-col p-3 justify-between">
          {/* Top Row */}
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/40 backdrop-blur-md border border-white/10">
              {category.icon ? (
                <span className="text-lg leading-none" role="img" aria-label="category icon">{category.icon}</span>
              ) : isFeatured ? (
                <Star className="h-4 w-4 text-primary" />
              ) : (
                <Folder className="h-4 w-4 text-primary" />
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
              {/* Drag Handle */}
              {isDraggable && (
                <div
                  {...dragHandleProps}
                  className={cn(
                    "cursor-grab active:cursor-grabbing p-1.5 bg-black/30 backdrop-blur-md border border-white/10 rounded-lg text-white/50 hover:text-white transition-all",
                    isAlreadyFeatured && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
              )}

              {/* Edit Button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg bg-black/30 backdrop-blur-md border border-white/10 text-white/50 hover:text-primary hover:bg-primary/20 transition-all"
                onClick={() => onEdit?.(category)}
              >
                <Edit2 className="w-3.5 h-3.5" />
              </Button>

              {/* Delete/Remove Button */}
              {isFeatured ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg bg-black/30 backdrop-blur-md border border-white/10 text-white/50 hover:text-red-400 hover:bg-red-500/20 transition-all"
                  onClick={handleRemoveFromFeatured}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-7 w-7 rounded-lg bg-black/30 backdrop-blur-md border border-white/10 text-white/50 hover:text-red-400 hover:bg-red-500/20 transition-all",
                    isAlreadyFeatured && "opacity-50 cursor-not-allowed hover:text-white/50 hover:bg-black/30"
                  )}
                  onClick={() => !isAlreadyFeatured && setShowDeleteModal(true)}
                  title={isAlreadyFeatured ? "Remove from featured first" : "Delete category"}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Bottom Row */}
          <div className="flex-1 flex flex-col justify-end min-w-0">
            {parentName && (
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-[10px] text-white/40 font-medium">in</span>
                <span className="text-[10px] text-primary/70 font-semibold truncate">{parentName}</span>
              </div>
            )}
            <h3 className="text-sm font-bold tracking-tight text-white line-clamp-2 drop-shadow-md">
              {name}
            </h3>
            {description && (
              <p className="text-[10px] text-white/50 line-clamp-3 font-medium mt-0.5 break-words">
                {description}
              </p>
            )}

            {/* Stats Row */}
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex items-center gap-0.5 text-white/40">
                <Users className="w-3 h-3" />
                <span className="text-[9px] font-medium">1.2k</span>
              </div>
              <div className="flex items-center gap-0.5 text-white/40">
                <TrendingUp className="w-3 h-3" />
                <span className="text-[9px] font-medium">89%</span>
              </div>
              <div className="flex items-center gap-0.5 text-white/40">
                <Trophy className="w-3 h-3" />
                <span className="text-[9px] font-medium">#4</span>
              </div>
            </div>

            {/* Status Indicator */}
            <div className={cn(
              "absolute top-3 left-3 h-1.5 w-1.5 rounded-full",
              category.is_active ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" : "bg-slate-400"
            )} />

            {/* Already Featured Badge - bottom right corner */}
            {isRepository && isAlreadyFeatured && (
              <div className="absolute bottom-2 right-2 z-20 p-1 bg-red-500/90 rounded-md shadow-lg">
                <Star className="w-3 h-3 text-white fill-white" />
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Delete Modal - only for repository cards */}
      {isRepository && (
        <CategoryDeleteModal
          category={category}
          open={showDeleteModal}
          onOpenChange={setShowDeleteModal}
        />
      )}
    </>
  );
}
