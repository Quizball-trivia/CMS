'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { Category } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GripVertical, Edit2, Trash2, X, Star, Users, TrendingUp, Trophy } from 'lucide-react';
import { cn, getLocalizedText } from '@/lib/utils';
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
}: UnifiedCategoryCardProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const name = getLocalizedText(category.name, 'Untitled');
  const description = getLocalizedText(category.description);

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
          "relative flex flex-col overflow-hidden border border-gray-200/50 bg-white rounded-[2rem] transition-all duration-300 group/card cursor-pointer",
          isDragging && "opacity-50 scale-95 z-50",
          isFeatured ? "h-[240px] w-[420px] flex-shrink-0 shadow-sm hover:shadow-xl hover:-translate-y-1" : "h-[200px] w-full shadow-sm hover:shadow-md hover:-translate-y-0.5"
        )}
        onClick={() => onEdit?.(category)}
      >
        {/* Background Layer */}
        <div className="absolute inset-0 z-0">
          {category.image_url ? (
            <>
              <Image
                src={category.image_url}
                alt=""
                fill
                unoptimized
                className="object-cover transition-transform duration-500 group-hover/card:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            </>
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 transition-colors duration-300 group-hover/card:from-gray-200 group-hover/card:to-gray-300" />
          )}
        </div>

        <div className="relative z-10 flex h-full flex-col p-5 justify-between">
          {/* Top Row */}
          <div className="flex items-start justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-sm group-hover/card:bg-white/20 transition-colors">
              {category.icon ? (
                <span className="text-xl leading-none" role="img" aria-label="category icon">{category.icon}</span>
              ) : (
                <Star className={cn("h-5 w-5", category.image_url ? "text-white" : "text-gray-400")} />
              )}
            </div>

            {/* Action buttons - visible on hover or low opacity */}
            <div className="absolute top-5 right-5 z-30 flex items-center gap-1.5 opacity-0 group-hover/card:opacity-100 transition-opacity duration-200" onClick={(e) => e.stopPropagation()}>
              {isDraggable && (
                <div
                  {...dragHandleProps}
                  className={cn(
                    "cursor-grab active:cursor-grabbing p-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white hover:bg-white/20 transition-all",
                    isAlreadyFeatured && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <GripVertical className="w-4 h-4" />
                </div>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 transition-all"
                onClick={() => onEdit?.(category)}
              >
                <Edit2 className="w-4 h-4" />
              </Button>

              {isFeatured ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-red-500 hover:border-red-500 transition-all"
                  onClick={handleRemoveFromFeatured}
                >
                  <X className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-9 w-9 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-red-500 hover:border-red-500 transition-all",
                    isAlreadyFeatured && "opacity-50 cursor-not-allowed"
                  )}
                  onClick={() => !isAlreadyFeatured && setShowDeleteModal(true)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>

            {/* Rank/Trophy Badge - Top Right */}
            <div className={cn(
              "absolute top-5 right-5 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-md transition-all duration-300 group-hover/card:opacity-0",
              category.image_url ? "bg-emerald-500/30 text-emerald-200 border border-emerald-500/20" : "bg-emerald-100/80 text-emerald-700 border border-emerald-200"
            )}>
              <Trophy className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold uppercase tracking-wider">#52</span>
            </div>
          </div>

          {/* Bottom Row */}
          <div className="flex-1 flex flex-col justify-end min-w-0">
            <h3 className={cn(
              "text-lg font-bold tracking-tight line-clamp-1 drop-shadow-sm transition-colors",
              category.image_url ? "text-white" : "text-gray-900"
            )}>
              {name}
            </h3>
            {description && (
              <p className={cn(
                "text-xs line-clamp-2 font-medium mt-1 mb-3 transition-colors",
                category.image_url ? "text-white/70" : "text-gray-500"
              )}>
                {description}
              </p>
            )}

            {/* Stats Row */}
            <div className="flex items-center gap-3">
              <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors", category.image_url ? "bg-white/10 text-white/80" : "bg-gray-100 text-gray-600")}>
                <Users className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">1.2k</span>
              </div>
              <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors", category.image_url ? "bg-white/10 text-white/80" : "bg-gray-100 text-gray-600")}>
                <TrendingUp className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">89%</span>
              </div>
            </div>

            {/* Status Indicator */}
            <div className={cn(
              "absolute top-5 left-5 h-2 w-2 rounded-full",
              category.is_active ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" : "bg-gray-300"
            )} />
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
