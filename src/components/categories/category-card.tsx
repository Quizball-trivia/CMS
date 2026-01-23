'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useDeleteCategory } from '@/hooks';
import { DEFAULT_LANGUAGE } from '@/lib/constants';
import type { Category } from '@/types';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Edit2, Trash2, Folder, Layers, Hash, Users, TrendingUp, Trophy } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface CategoryCardProps {
  category: Category;
  childCount?: number;
  questionCount?: number; // Added for future scalability
  onEdit?: (category: Category) => void;
}

export function CategoryCard({ category, childCount = 0, questionCount = 0, onEdit }: CategoryCardProps) {
  const router = useRouter();
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

  return (
    <>
      <Card 
        className="group relative flex min-h-[220px] w-full flex-col overflow-hidden border border-white/10 bg-[#0a0a0a] transition-all duration-300 hover:shadow-2xl hover:shadow-primary/20 active:scale-[0.99] cursor-pointer rounded-[2rem]"
        onClick={() => onEdit ? onEdit(category) : router.push(`/categories/${category.id}`)}
      >
        {/* Background Layer */}
        <div className="absolute inset-0 z-0">
          {category.image_url ? (
            <>
              <img 
                src={category.image_url} 
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
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
              {category.icon ? (
                <span className="text-3xl leading-none" role="img" aria-label="category icon">{category.icon}</span>
              ) : (
                <Folder className="h-6 w-6 text-primary" />
              )}
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2 bg-[#22c55e] text-white px-3 py-1.5 rounded-lg shadow-lg">
                <Trophy className="w-4 h-4" />
                <span className="text-xs font-black tracking-tighter">#52</span>
              </div>
              
              <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full bg-black/20 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-all"
                    >
                      <MoreHorizontal className="h-4 w-4 text-white" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-background/80 backdrop-blur-xl border-white/10 rounded-xl">
                    <DropdownMenuItem onClick={() => onEdit ? onEdit(category) : router.push(`/categories/${category.id}`)} className="cursor-pointer">
                      <Edit2 className="mr-2 h-4 w-4" />
                      Edit Category
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-white/5" />
                    <DropdownMenuItem
                      className="text-destructive focus:bg-destructive focus:text-destructive-foreground cursor-pointer"
                      onClick={() => setShowDeleteDialog(true)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Bottom Row */}
          <div className="flex items-end justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-2xl font-black tracking-tight text-white truncate drop-shadow-md group-hover:text-primary transition-colors">
                {name}
              </h3>
              <p className="mt-1 text-sm text-white/70 line-clamp-1 font-medium max-w-[80%]">
                {description}
              </p>
              
              <div className="mt-4 flex items-center gap-3">
                <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full shadow-lg transition-transform hover:scale-105" title="Total Players">
                  <Users className="w-3.5 h-3.5 text-white/60" />
                  <span className="text-xs font-bold text-white tracking-tight">24.8k</span>
                </div>
                <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full shadow-lg transition-transform hover:scale-105" title="Popularity Score">
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
    </>
  );
}
