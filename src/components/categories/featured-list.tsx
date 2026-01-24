'use client';

import { useRef } from 'react';
import type { FeaturedCategory, Category } from '@/types';
import { SortableFeaturedCard } from './sortable-featured-card';
import { FeaturedDropZone } from './featured-drop-zone';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 420; // Card width + gap
      const newScrollLeft = scrollContainerRef.current.scrollLeft +
        (direction === 'left' ? -scrollAmount : scrollAmount);
      scrollContainerRef.current.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex gap-6 overflow-x-auto pb-6 scrollbar-hide">
        {[1, 2, 3].map((i) => (
          <div key={i} className="w-[420px] h-[240px] bg-gray-100 rounded-[2rem] animate-pulse flex-shrink-0 border border-gray-200/50" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="rounded-2xl border-red-100 bg-red-50 text-red-600">
        <AlertDescription>Failed to load featured categories.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="relative group/scroll">
      {/* Scrollable Container */}
      <div 
        ref={scrollContainerRef} 
        className="overflow-x-auto scrollbar-hide pb-4 -mx-1 px-1"
      >
        <FeaturedDropZone itemIds={items.map((i) => i.id)}>
          <div className="flex gap-6">
            {items.map((item) => (
              <SortableFeaturedCard
                key={item.id}
                featured={item}
                onEdit={onEditCategory}
                onRemoveFromFeatured={onRemoveFromFeatured}
              />
            ))}
          </div>
        </FeaturedDropZone>
      </div>

      {/* Navigation Arrows - Minimal SaaS style */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute left-4 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm border border-gray-200 shadow-xl opacity-0 group-hover/scroll:opacity-100 transition-all hover:bg-white hover:scale-110 -ml-5"
        onClick={() => scroll('left')}
      >
        <ChevronLeft className="h-5 w-5 text-gray-600" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm border border-gray-200 shadow-xl opacity-0 group-hover/scroll:opacity-100 transition-all hover:bg-white hover:scale-110 -mr-5"
        onClick={() => scroll('right')}
      >
        <ChevronRight className="h-5 w-5 text-gray-600" />
      </Button>
    </div>
  );
}
