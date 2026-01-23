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
      <div className="flex gap-3 overflow-x-auto pb-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="w-[320px] h-[180px] bg-card/20 rounded-2xl animate-pulse flex-shrink-0 border border-white/5" />
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

  return (
    <div className="relative group/scroll">
      {/* Left Arrow */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white opacity-0 group-hover/scroll:opacity-100 transition-opacity hover:bg-black/80 -ml-5"
        onClick={() => scroll('left')}
      >
        <ChevronLeft className="h-6 w-6" />
      </Button>

      {/* Scrollable Container */}
      <div ref={scrollContainerRef} className="overflow-x-auto scrollbar-hide">
        <FeaturedDropZone itemIds={items.map((i) => i.id)}>
          {items.map((item) => (
            <SortableFeaturedCard
              key={item.id}
              featured={item}
              onEdit={onEditCategory}
              onRemoveFromFeatured={onRemoveFromFeatured}
            />
          ))}
        </FeaturedDropZone>
      </div>

      {/* Right Arrow */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white opacity-0 group-hover/scroll:opacity-100 transition-opacity hover:bg-black/80 -mr-5"
        onClick={() => scroll('right')}
      >
        <ChevronRight className="h-6 w-6" />
      </Button>
    </div>
  );
}
