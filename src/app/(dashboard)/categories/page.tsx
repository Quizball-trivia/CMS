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
import { Card, CardContent } from '@/components/ui/card';
import { Plus, LayoutGrid, List, Edit2 } from 'lucide-react';
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

  return (
    <CategoriesDndContext
      featuredItems={featuredItems}
      onAddToFeatured={handleAddToFeatured}
      onRemoveFromFeatured={handleRemoveFromFeatured}
      onReorderFeatured={handleReorderFeatured}
      onFeaturedItemsChange={handleFeaturedItemsChange}
    >
      <div className="space-y-10 animate-in fade-in duration-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <h1 className="text-4xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/60">
              Categories
            </h1>
            <p className="text-muted-foreground/60 font-medium tracking-tight">
              Architect and organize your quiz hierarchy with high-level categories.
            </p>
          </div>

          <Button
            size="lg"
            onClick={handleOpenCreate}
            className="shadow-2xl shadow-primary/20 transition-all active:scale-[0.98] bg-primary hover:bg-primary/90 border border-white/10 h-12 px-6 rounded-xl font-bold tracking-tight"
          >
            <Plus className="w-5 h-5 mr-2" />
            New Category
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-hidden bg-background/60 backdrop-blur-3xl border border-white/10 shadow-[0_30px_120px_-40px_rgba(0,0,0,0.9)] p-0 rounded-[2.5rem]">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none" />
              <div className="relative flex flex-col h-full max-h-[90vh]">
                <DialogHeader className="p-8 pb-6 border-b border-white/10 shrink-0">
                  <div className="flex items-center gap-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 shadow-inner">
                      {isEditing ? (
                        <Edit2 className="w-6 h-6 text-primary" />
                      ) : (
                        <Plus className="w-6 h-6 text-primary" />
                      )}
                    </div>
                    <div className="space-y-0.5">
                      <DialogTitle className="text-2xl font-bold tracking-tight">
                        {isEditing ? 'Edit Category' : 'Create Category'}
                      </DialogTitle>
                      <DialogDescription className="text-muted-foreground text-sm font-medium">
                        {isEditing
                          ? 'Update the category details below.'
                          : 'Define a new content bucket for your questions.'}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto p-8 pt-6">
                  <CategoryForm
                    category={editingCategory}
                    onSuccess={handleClose}
                  />
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-12 max-w-[1400px] mx-auto px-4">
          <section className="space-y-6">
            <div className="flex items-center gap-3 text-primary/60 px-1">
              <div className="p-2 bg-primary/5 rounded-xl backdrop-blur-md border border-primary/10 shadow-sm">
                <LayoutGrid className="w-5 h-5" />
              </div>
              <h2 className="text-[10px] font-black uppercase tracking-[0.3em]">Featured Collections</h2>
            </div>
            <Card className="border-white/10 shadow-2xl bg-card/20 backdrop-blur-xl rounded-[2.5rem] overflow-hidden border">
              <CardContent className="p-10">
                <FeaturedList
                  items={featuredItems}
                  isLoading={featuredLoading}
                  error={featuredError}
                  onEditCategory={handleOpenEdit}
                  onRemoveFromFeatured={handleRemoveFromFeatured}
                />
              </CardContent>
            </Card>
          </section>

          <section className="space-y-6">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-3 text-primary/60">
                <div className="p-2 bg-primary/5 rounded-xl backdrop-blur-md border border-primary/10 shadow-sm">
                  <List className="w-5 h-5" />
                </div>
                <h2 className="text-[10px] font-black uppercase tracking-[0.3em]">All Categories</h2>
              </div>
            </div>
            <CategoryList
              onEditCategory={handleOpenEdit}
              featuredCategoryIds={featuredCategoryIds}
            />
          </section>
        </div>
      </div>
    </CategoriesDndContext>
  );
}
