'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useDuplicateQuestions, useDeleteQuestion } from '@/hooks';
import type { DuplicateGroup } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Copy, Trash2, AlertCircle, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDifficultyVariant } from '@/components/ui/difficulty-signal';
import { getLocalizedText } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { getErrorLogDetails } from '@/lib/error-feedback';
import { useErrorFeedbackDialog } from '@/hooks/use-error-feedback-dialog';
import { ErrorFeedbackDialog } from '@/components/error-feedback-dialog';

export function DuplicateManagerDialog() {
  const [open, setOpen] = useState(false);
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const { errorFeedback, showErrorFeedback, closeErrorFeedback } = useErrorFeedbackDialog();

  const { data: duplicatesData, isLoading, refetch } = useDuplicateQuestions(
    { include_drafts: true },
    { enabled: open }
  );
  const deleteQuestion = useDeleteQuestion();

  const handleToggleQuestion = (questionId: string) => {
    setSelectedForDeletion((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  };

  const handleSelectOldestInGroup = (group: DuplicateGroup) => {
    // Deselect all in group first
    const groupIds = group.questions.map((q) => q.id);
    setSelectedForDeletion((prev) => {
      const next = new Set(prev);
      groupIds.forEach((id) => next.delete(id));
      return next;
    });

    // Select all except the oldest (first one)
    const toDelete = group.questions.slice(1).map((q) => q.id);
    setSelectedForDeletion((prev) => {
      const next = new Set(prev);
      toDelete.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedForDeletion.size === 0) {
      toast.error('No questions selected for deletion');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedForDeletion.size} question(s)? This action cannot be undone.`
    );

    if (!confirmed) return;

    setIsDeleting(true);
    const idsToDelete = Array.from(selectedForDeletion);
    let successCount = 0;
    let errorCount = 0;
    let firstError: { id: string; error: unknown } | null = null;

    try {
      // Delete questions one by one
      for (const id of idsToDelete) {
        try {
          await deleteQuestion.mutateAsync(id);
          successCount++;
        } catch (error) {
          errorCount++;
          firstError ??= { id, error };
          logger.error('questions', 'Failed to delete duplicate-manager question', {
            questionId: id,
            ...getErrorLogDetails(error),
          });
        }
      }

      if (errorCount === 0) {
        toast.success(`Successfully deleted ${successCount} question(s)`);
      } else {
        toast.warning(
          `Deleted ${successCount} question(s), ${errorCount} failed`,
          { description: 'Open the error details for the first failure and retry the failed items.' }
        );
        if (firstError) {
          showErrorFeedback(firstError.error, {
            fallbackTitle: `Failed to delete ${errorCount} question${errorCount > 1 ? 's' : ''}`,
            logModule: 'questions',
            logMessage: 'Duplicate-manager delete had failed items',
            logData: {
              failedCount: errorCount,
              firstFailedQuestionId: firstError.id,
            },
          });
        }
      }

      // Clear selection and refetch
      setSelectedForDeletion(new Set());
      await refetch();
    } catch (error) {
      showErrorFeedback(error, {
        fallbackTitle: 'Failed to delete questions',
        logModule: 'questions',
        logMessage: 'Failed to delete duplicate-manager questions',
        logData: {
          selectedCount: idsToDelete.length,
        },
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const totalDuplicates = duplicatesData?.groups.reduce(
    (sum, group) => sum + group.questions.length,
    0
  ) ?? 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <ErrorFeedbackDialog feedback={errorFeedback} onOpenChange={(isOpen) => {
        if (!isOpen) closeErrorFeedback();
      }} />
      <DialogTrigger asChild>
        <Button variant="outline">
          <Search className="mr-2 h-4 w-4" />
          Find Duplicates
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Duplicate Questions</DialogTitle>
          <DialogDescription>
            Find and remove duplicate questions from your database. Questions with identical prompts
            are grouped together.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-2">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
                <p className="text-sm text-muted-foreground">Scanning for duplicates...</p>
              </div>
            </div>
          ) : !duplicatesData || duplicatesData.total_groups === 0 ? (
            <Alert className="border-green-200 bg-green-50">
              <AlertCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                No duplicate questions found! Your database is clean.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <Alert className="border-amber-200 bg-amber-50">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  Found <strong>{duplicatesData.total_groups}</strong> duplicate group(s) with{' '}
                  <strong>{totalDuplicates}</strong> total questions.
                  {selectedForDeletion.size > 0 && (
                    <span className="ml-2">
                      ({selectedForDeletion.size} selected for deletion)
                    </span>
                  )}
                </AlertDescription>
              </Alert>

              <div className="space-y-6">
                {duplicatesData.groups.map((group, groupIndex) => (
                  <div
                    key={groupIndex}
                    className="border rounded-lg p-4 space-y-3 bg-white shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Copy className="h-4 w-4 text-gray-400" />
                          <span className="font-semibold text-sm text-gray-700">
                            Duplicate Group {groupIndex + 1}
                          </span>
                          <Badge variant="outline">{group.questions.length} copies</Badge>
                        </div>
                        <p className="text-sm font-medium text-gray-900 line-clamp-2">
                          {typeof group.prompt === 'string' ? group.prompt : getLocalizedText(group.prompt)}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSelectOldestInGroup(group)}
                      >
                        Keep Oldest Only
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {group.questions.map((question, questionIndex) => (
                        <div
                          key={question.id}
                          className={cn(
                            'flex items-center gap-3 p-3 rounded-md border transition-colors',
                            selectedForDeletion.has(question.id)
                              ? 'bg-red-50 border-red-200'
                              : 'bg-gray-50 border-gray-200'
                          )}
                        >
                          <Checkbox
                            checked={selectedForDeletion.has(question.id)}
                            onCheckedChange={() => handleToggleQuestion(question.id)}
                          />
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>#{questionIndex + 1}</span>
                              {questionIndex === 0 && (
                                <Badge variant="outline" className="text-green-600 border-green-600">
                                  Oldest
                                </Badge>
                              )}
                              <span>•</span>
                              <span>{new Date(question.created_at).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={getDifficultyVariant(question.difficulty)}>
                                {question.difficulty}
                              </Badge>
                              <Badge
                                variant={
                                  question.status === 'published'
                                    ? 'default'
                                    : question.status === 'draft'
                                    ? 'secondary'
                                    : 'outline'
                                }
                              >
                                {question.status}
                              </Badge>
                              {/* Category name not available in this context */}
                            </div>
                          </div>
                          {selectedForDeletion.has(question.id) && (
                            <Trash2 className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDeleteSelected}
            disabled={selectedForDeletion.size === 0 || isDeleting}
          >
            {isDeleting ? (
              <>Deleting...</>
            ) : (
              <>
                Delete {selectedForDeletion.size > 0 && `(${selectedForDeletion.size})`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
