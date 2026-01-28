'use client';

import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { CategoryList, FeaturedList, CategoriesDndContext } from '@/components/categories';
import {
  useFeaturedCategories,
  useCreateFeaturedCategory,
  useDeleteFeaturedCategory,
  useReorderFeaturedCategories,
} from '@/hooks';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CategoryForm } from '@/components/categories/category-form';
import type { Category, FeaturedCategory } from '@/types';

export default function CategoriesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | undefined>(undefined);

  // Featured categories state
  const { data: featuredData, isLoading: featuredLoading, error: featuredError } = useFeaturedCategories();
  // Local order state for optimistic reordering during drag (stores just the order of IDs)
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const createFeatured = useCreateFeaturedCategory();
  const deleteFeatured = useDeleteFeaturedCategory();
  const reorderFeatured = useReorderFeaturedCategories();

  // Build the displayed featured items - use local order if set, otherwise use server data order
  const featuredItems = useMemo(() => {
    const serverItems = featuredData ?? [];
    if (!localOrder) return serverItems;

    // Build a map for quick lookup
    const itemMap = new Map(serverItems.map(item => [item.id, item]));
    // Return items in local order, filtering out any that don't exist in server data
    return localOrder
      .map(id => itemMap.get(id))
      .filter((item): item is FeaturedCategory => item !== undefined);
  }, [featuredData, localOrder]);

  // Compute which category IDs are already featured
  const featuredCategoryIds = useMemo(() => {
    return new Set(featuredItems.map((f) => f.category_id));
  }, [featuredItems]);

  // Handler for when items are reordered during drag
  const handleFeaturedItemsChange = useCallback((items: FeaturedCategory[]) => {
    setLocalOrder(items.map(item => item.id));
  }, []);

  const handleOpenCreate = () => {
    setEditingCategory(undefined);
    setDialogOpen(true);
  };

  const handleOpenEdit = (category: Category) => {
    setEditingCategory(category);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditingCategory(undefined);
  };

  const handleAddToFeatured = async (categoryId: string) => {
    try {
      await createFeatured.mutateAsync({ category_id: categoryId });
      toast.success('Added to featured');
    } catch {
      toast.error('Failed to add to featured');
    }
  };

  const handleRemoveFromFeatured = async (featuredId: string) => {
    try {
      await deleteFeatured.mutateAsync(featuredId);
      // Clear local order so we use fresh server data
      setLocalOrder(null);
      toast.success('Removed from featured');
    } catch {
      toast.error('Failed to remove from featured');
    }
  };

  const handleReorderFeatured = async (items: Array<{ id: string; sort_order: number }>) => {
    try {
      await reorderFeatured.mutateAsync({ items });
      // Clear local order after successful reorder so we use fresh server data
      setLocalOrder(null);
      toast.success('Featured categories reordered');
    } catch {
      // Revert to server data on error
      setLocalOrder(null);
      toast.error('Failed to reorder categories');
    }
  };

  const isEditing = !!editingCategory;

  const [searchTerm, setSearchTerm] = useState('');

  return (
    <CategoriesDndContext
      featuredItems={featuredItems}
      onAddToFeatured={handleAddToFeatured}
      onRemoveFromFeatured={handleRemoveFromFeatured}
      onReorderFeatured={handleReorderFeatured}
      onFeaturedItemsChange={handleFeaturedItemsChange}
    >
      <div className="min-h-screen bg-[#f8f9fb] text-foreground py-10">
        <div className="max-w-[1280px] mx-auto px-8 space-y-10">
          {/* Page Header */}
          <header className="space-y-1">
            <h1 className="text-4xl font-black tracking-tight text-gray-900">
              Categories
            </h1>
            <p className="text-gray-500 font-medium text-base">
              Manage and explore different football categories.
            </p>
          </header>

          {/* Control Row */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-72 group">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Plus className="h-4 w-4 text-gray-400 rotate-45 group-focus-within:text-primary transition-colors" />
              </div>
              <input
                type="text"
                placeholder="Search categories..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-10 py-2.5 bg-gray-200/30 border-transparent rounded-xl text-sm focus:ring-2 focus:ring-primary/10 focus:bg-white focus:border-gray-200 transition-all placeholder:text-gray-400 font-medium"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
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
              New Category
            </Button>
          </div>

          <div className="space-y-16 pt-4">
            {/* Featured Section */}
            <section className="space-y-6">
              <div className="flex items-center gap-3 px-1">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">
                  Featured Collections
                </h2>
              </div>
              <FeaturedList
                items={featuredItems}
                isLoading={featuredLoading}
                error={featuredError}
                onEditCategory={handleOpenEdit}
                onRemoveFromFeatured={handleRemoveFromFeatured}
              />
            </section>

            {/* All Categories Section */}
            <section className="space-y-6">
              <div className="flex items-center gap-3 px-1">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">
                  All Categories
                </h2>
              </div>
              <CategoryList
                onEditCategory={handleOpenEdit}
                featuredCategoryIds={featuredCategoryIds}
                searchTerm={searchTerm}
              />
            </section>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] p-0 overflow-hidden border-none shadow-2xl rounded-[2rem] flex flex-col">
            <DialogHeader className="p-8 pb-4 shrink-0">
              <DialogTitle className="text-2xl font-bold tracking-tight">
                {isEditing ? 'Edit Category' : 'Create Category'}
              </DialogTitle>
              <DialogDescription className="text-gray-500 font-medium">
                {isEditing
                  ? 'Update the category details below.'
                  : 'Define a new content bucket for your questions.'}
              </DialogDescription>
            </DialogHeader>
            <div className="px-8 pb-8 overflow-y-auto flex-1">
              <CategoryForm
                key={editingCategory?.id ?? 'new'}
                category={editingCategory}
                onSuccess={handleClose}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </CategoriesDndContext>
  );
}
