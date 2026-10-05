'use client';

import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TdCategoryForm } from '@/components/td/categories/td-category-form';
import { TdCategoryList } from '@/components/td/categories/td-category-list';
import { categoryName, TD_CATEGORY_ROUNDS, useTdCategoryCounts, type TdCategoryRow } from '@/components/td/categories/td-category-data';
import { useTdAllRows } from '@/hooks/use-td-content';
import { t } from '@/lib/td/i18n';

const ALL = { status: 'draft,ready,approved,archived' };

/** The Quizball CMS's Categories page, for the categories of the two rounds that have them: one section a round, the archived ones last. */
export function TdCategoriesTab() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<TdCategoryRow | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  // Asked before the dialog closes: the open form says whether it may be left.
  const leaveRef = useRef<() => boolean>(() => true);

  const cardCategories = useTdAllRows('card-categories', ALL);
  const boxCategories = useTdAllRows('box-categories', ALL);
  const countOf = useTdCategoryCounts();

  const handleOpenCreate = () => {
    setEditingCategory(undefined);
    setDialogOpen(true);
  };

  const handleOpenEdit = (category: TdCategoryRow) => {
    setEditingCategory(category);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditingCategory(undefined);
  };

  const isEditing = !!editingCategory;

  const normalizedSearch = searchTerm.toLowerCase().trim();
  const sections = TD_CATEGORY_ROUNDS.map((round) => {
    const query = round.type === 'card-categories' ? cardCategories : boxCategories;
    return { ...round, isLoading: query.isLoading, error: query.error, rows: (query.data?.rows ?? []) as TdCategoryRow[] };
  });
  const matches = (category: TdCategoryRow) => !normalizedSearch || categoryName(category).toLowerCase().includes(normalizedSearch);
  const live = sections.map((section) => section.rows.filter((row) => row.status !== 'archived' && matches(row)));
  const archivedCategories = sections.flatMap((section) => section.rows.filter((row) => row.status === 'archived' && matches(row)));

  return (
    <div className="min-h-screen bg-[#f8f9fb] text-foreground py-10">
      <div className="max-w-[1280px] mx-auto px-8 space-y-10">
        {/* Page Header */}
        <header className="space-y-1">
          <h1 className="text-4xl font-black tracking-tight text-gray-900">{t('Categories')}</h1>
          <p className="text-gray-500 font-medium text-base">{t('Manage and explore different football categories.')}</p>
        </header>

        {/* Control Row */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative w-72 group">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Plus className="h-4 w-4 text-gray-400 rotate-45 group-focus-within:text-primary transition-colors" />
            </div>
            <input
              type="text"
              placeholder={t('Search categories...')}
              aria-label={t('Search categories...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-10 py-2.5 bg-gray-200/30 border-transparent rounded-xl text-sm focus:ring-2 focus:ring-primary/10 focus:bg-white focus:border-gray-200 transition-all placeholder:text-gray-400 font-medium"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                aria-label={t('Clear search')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <Button
            onClick={handleOpenCreate}
            className="bg-gray-900 hover:bg-gray-800 text-white px-6 h-11 rounded-xl font-bold text-sm transition-all shadow-lg shadow-gray-200 active:scale-95 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('New Category')}
          </Button>
        </div>

        <div className="space-y-10 pt-2">
          {sections.map((section, index) => (
            <section key={section.type} className="space-y-6">
              <div className="flex items-center gap-3 px-1">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">{section.label}</h2>
              </div>
              <TdCategoryList
                categories={live[index]}
                isLoading={section.isLoading}
                error={section.error}
                searching={normalizedSearch !== ''}
                emptyTitle={section.empty}
                countOf={countOf}
                onEditCategory={handleOpenEdit}
              />
            </section>
          ))}

          {archivedCategories.length > 0 && (
            <section className="space-y-6">
              <div className="flex items-center gap-3 px-1">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">{t('Archived')}</h2>
              </div>
              <TdCategoryList categories={archivedCategories} isLoading={false} error={null} searching={false} emptyTitle="" showRound countOf={countOf} onEditCategory={handleOpenEdit} />
            </section>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : leaveRef.current() && handleClose())}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] p-0 overflow-hidden border-none shadow-2xl rounded-[2rem] flex flex-col">
          <DialogHeader className="p-8 pb-4 shrink-0">
            <DialogTitle className="text-2xl font-bold tracking-tight">{isEditing ? t('Edit Category') : t('Create Category')}</DialogTitle>
            <DialogDescription className="text-gray-500 font-medium">{isEditing ? t('Update the category details below.') : t('Define a new content bucket for your questions.')}</DialogDescription>
          </DialogHeader>
          <div className="px-8 pb-8 overflow-y-auto flex-1">
            <TdCategoryForm key={editingCategory?.id ?? 'new'} category={editingCategory} leaveRef={leaveRef} onSuccess={handleClose} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
