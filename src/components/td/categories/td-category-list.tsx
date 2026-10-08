'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { SearchX } from 'lucide-react';
import { t } from '@/lib/td/i18n';
import { TdCategoryCard } from './td-category-card';
import { categoryTypeOf, roundOf, type TdCategoryRow, type TdCategoryType } from './td-category-data';

interface TdCategoryListProps {
  /** Already filtered by the search. */
  categories: TdCategoryRow[];
  isLoading: boolean;
  error: unknown;
  searching: boolean;
  /** What an empty list says when nothing is searched for. */
  emptyTitle: string;
  /** Name the round on each card (a list that mixes both rounds). */
  showRound?: boolean;
  countOf: (type: TdCategoryType, key: string) => number | null;
  onEditCategory: (category: TdCategoryRow) => void;
}

/** Quizball's category grid, for the categories of one round (or the archived ones of both). */
export function TdCategoryList({ categories, isLoading, error, searching, emptyTitle, showRound = false, countOf, onEditCategory }: TdCategoryListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 w-full animate-pulse rounded-2xl border border-gray-200/50 bg-gray-100" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-full rounded-2xl border-red-100 bg-red-50 text-red-600">
        <AlertDescription>{t('Failed to load categories. Please try again.')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => {
          const type = categoryTypeOf(category);
          return <TdCategoryCard key={category.id} category={category} count={countOf(type, category.data.key)} description={showRound ? roundOf(type).label : undefined} onEdit={onEditCategory} />;
        })}
      </div>

      {categories.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-gray-100/50 rounded-[2.5rem] border border-dashed border-gray-200">
          <div className="p-4 bg-white rounded-full shadow-sm mb-4">
            <SearchX className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-gray-500 font-bold tracking-tight">{searching ? t('No categories found') : emptyTitle}</p>
          {searching && <p className="text-gray-400 text-sm mt-1">{t('Try searching for something else')}</p>}
        </div>
      )}
    </div>
  );
}
