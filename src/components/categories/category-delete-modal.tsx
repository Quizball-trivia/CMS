'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useCategoryDependencies, useCascadeDeleteCategory, useDeleteCategory } from '@/hooks';
import { useDeleteQuestion } from '@/hooks/use-questions';
import { DEFAULT_LANGUAGE } from '@/lib/constants';
import type { Category } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Trash2, AlertTriangle, Loader2, FileQuestion, FolderTree } from 'lucide-react';

export interface CategoryDeleteModalProps {
  category: Category;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

export function CategoryDeleteModal({
  category,
  open,
  onOpenChange,
  onDeleted,
}: CategoryDeleteModalProps) {
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null);

  const { data: dependencies, isLoading, refetch } = useCategoryDependencies(category.id, open);
  const deleteCategory = useDeleteCategory();
  const cascadeDeleteCategory = useCascadeDeleteCategory();
  const deleteQuestion = useDeleteQuestion();

  const categoryName = category.name[DEFAULT_LANGUAGE] || Object.values(category.name)[0] || 'Untitled';

  const hasChildren = (dependencies?.children.length ?? 0) > 0;
  const hasQuestions = (dependencies?.questions.length ?? 0) > 0;
  const questionCount = dependencies?.questions.length ?? 0;

  const handleDeleteQuestion = async (questionId: string) => {
    setDeletingQuestionId(questionId);
    try {
      await deleteQuestion.mutateAsync(questionId);
      toast.success('Question deleted');
      refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete question';
      toast.error(message);
    } finally {
      setDeletingQuestionId(null);
    }
  };

  const handleDeleteCategory = async () => {
    try {
      await deleteCategory.mutateAsync(category.id);
      toast.success('Category deleted successfully');
      onOpenChange(false);
      onDeleted?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete category';
      toast.error(message);
    }
  };

  const handleCascadeDelete = async () => {
    try {
      await cascadeDeleteCategory.mutateAsync(category.id);
      toast.success(`Category and ${questionCount} question${questionCount !== 1 ? 's' : ''} deleted`);
      onOpenChange(false);
      onDeleted?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete category';
      toast.error(message);
    }
  };

  const getQuestionLabel = (prompt: Record<string, string>) => {
    return prompt[DEFAULT_LANGUAGE] || Object.values(prompt)[0] || 'Untitled question';
  };

  const isPending = deleteCategory.isPending || cascadeDeleteCategory.isPending;

  // If category has children, show blocking modal
  if (hasChildren) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Cannot Delete: &quot;{categoryName}&quot;
            </DialogTitle>
          </DialogHeader>

          <Alert variant="destructive" className="mt-4">
            <FolderTree className="h-4 w-4" />
            <AlertTitle>This category has child categories</AlertTitle>
            <AlertDescription>
              <ul className="mt-2 list-disc pl-4 space-y-1">
                {dependencies?.children.map((child) => (
                  <li key={child.id}>
                    {child.name[DEFAULT_LANGUAGE] || Object.values(child.name)[0] || child.slug}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm">
                Delete or move child categories first.
              </p>
            </AlertDescription>
          </Alert>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Delete Category: &quot;{categoryName}&quot;</DialogTitle>
          <DialogDescription>
            {isLoading
              ? 'Checking for dependencies...'
              : hasQuestions
                ? 'This category has associated questions that will also be affected.'
                : 'Are you sure you want to delete this category?'}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : hasQuestions ? (
          <div className="mt-4 space-y-4">
            <Alert>
              <FileQuestion className="h-4 w-4" />
              <AlertTitle className="flex items-center gap-2">
                This category has {questionCount} question{questionCount !== 1 ? 's' : ''}
                <Badge variant="secondary" className="ml-1">
                  {questionCount}
                </Badge>
              </AlertTitle>
              <AlertDescription>
                You can delete questions individually or delete everything at once.
              </AlertDescription>
            </Alert>

            <div className="max-h-[200px] overflow-y-auto rounded-lg border border-border bg-muted/30">
              {dependencies?.questions.map((question) => (
                <div
                  key={question.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border/50 last:border-b-0"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-primary">&#8226;</span>
                    <span className="text-sm truncate">
                      {getQuestionLabel(question.prompt)}
                    </span>
                    <Badge variant="outline" className="text-xs flex-shrink-0">
                      {question.difficulty}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-muted-foreground hover:text-destructive flex-shrink-0"
                    onClick={() => handleDeleteQuestion(question.id)}
                    disabled={deletingQuestionId === question.id}
                  >
                    {deletingQuestionId === question.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4">
            This category has no questions or child categories. It can be safely deleted.
          </p>
        )}

        <DialogFooter className="mt-6 gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          {hasQuestions ? (
            <Button
              variant="destructive"
              onClick={handleCascadeDelete}
              disabled={isPending}
            >
              {cascadeDeleteCategory.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>Delete All & Remove Category</>
              )}
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={handleDeleteCategory}
              disabled={isPending}
            >
              {deleteCategory.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
