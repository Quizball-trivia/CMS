'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useUpdateQuestionStatus, useDeleteQuestion, useQuestion } from '@/hooks';
import type { Question, QuestionStatus } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Edit, CheckCircle2, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { getLocalizedTextByLang } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { getDifficultyVariant } from '@/components/ui/difficulty-signal';

interface QuestionPreviewDialogProps {
  question: Question;
  allQuestions?: Question[];
  currentIndex?: number;
  onNavigate?: (index: number) => void;
  totalAvailable?: number;
}

export function QuestionPreviewDialog({
  question,
  allQuestions = [],
  currentIndex = 0,
  onNavigate,
  totalAvailable = 0
}: QuestionPreviewDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(currentIndex);
  const [lang, setLang] = useState<'en' | 'ka'>('en');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();
  const updateStatus = useUpdateQuestionStatus();
  const deleteQuestion = useDeleteQuestion();

  const totalQuestions = allQuestions.length;
  const hasPrevious = activeIndex > 0;
  const hasNext = activeIndex < totalQuestions - 1;
  const showLoadingIndicator = totalAvailable > totalQuestions;
  const clampIndex = useCallback((index: number) => {
    if (totalQuestions === 0) return 0;
    return Math.min(Math.max(index, 0), totalQuestions - 1);
  }, [totalQuestions]);

  // Use the question at activeIndex if we're navigating, otherwise use the prop
  const displayQuestion = allQuestions.length > 0
    ? allQuestions[clampIndex(activeIndex)] ?? question
    : question;
  const { data: freshQuestion } = useQuestion(displayQuestion?.id ?? '', open && !!displayQuestion?.id);
  const hydratedQuestion = freshQuestion ?? displayQuestion;

  // Reset activeIndex when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setActiveIndex(clampIndex(currentIndex));
      setConfirmDelete(false);
    }
  };

  // Handle navigation
  const handleNavigate = useCallback((newIndex: number) => {
    const clampedIndex = clampIndex(newIndex);
    setActiveIndex(clampedIndex);
    if (onNavigate) {
      onNavigate(clampedIndex);
    }
  }, [clampIndex, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && hasPrevious) {
        e.preventDefault();
        handleNavigate(activeIndex - 1);
      } else if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        handleNavigate(activeIndex + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, activeIndex, hasPrevious, hasNext, handleNavigate]);

  const handleToggleStatus = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus: QuestionStatus = hydratedQuestion.status === 'published' ? 'draft' : 'published';

    try {
      await updateStatus.mutateAsync({ id: hydratedQuestion.id, data: { status: newStatus } });
      toast.success(`Question ${newStatus === 'published' ? 'published' : 'unpublished'}`);
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    router.push(`/questions/${hydratedQuestion.id}`);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    try {
      const result = await deleteQuestion.mutateAsync(hydratedQuestion.id);
      toast.success(result.message);
      setConfirmDelete(false);

      // Navigate to next question or close if none left
      if (hasNext) {
        // Index stays the same — the next question slides into this position
        // But we need to trigger a re-render since allQuestions will update via React Query
      } else if (hasPrevious) {
        handleNavigate(activeIndex - 1);
      } else {
        setOpen(false);
      }
    } catch {
      toast.error('Failed to delete question');
    }
  };

  // Reset confirmDelete when navigating
  useEffect(() => {
    setConfirmDelete(false);
  }, [activeIndex]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-xl hover:bg-white hover:shadow-sm text-gray-400 hover:text-gray-900"
          onClick={(e) => e.stopPropagation()}
        >
          <Eye className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <DialogHeader className="pr-10">
          <div className="flex items-center justify-between">
            <DialogTitle>Question Preview</DialogTitle>
            {totalQuestions > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {activeIndex + 1} of {showLoadingIndicator ? `${totalQuestions} (${totalAvailable} total)` : totalQuestions}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={!hasPrevious}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hasPrevious) handleNavigate(activeIndex - 1);
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={!hasNext}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hasNext) handleNavigate(activeIndex + 1);
                    }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header with badges + language toggle */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={cn('border', getDifficultyVariant(displayQuestion.difficulty))}>
                {hydratedQuestion.difficulty}
              </Badge>
              <Badge variant="outline">{hydratedQuestion.type}</Badge>
              <Badge
                variant={hydratedQuestion.status === 'published' ? 'default' : 'secondary'}
              >
                {hydratedQuestion.status}
              </Badge>
            </div>
            <div className="flex rounded-lg border overflow-hidden text-xs font-semibold">
              <button
                className={cn(
                  'px-3 py-1.5 transition-colors',
                  lang === 'en' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                )}
                onClick={() => setLang('en')}
              >
                EN
              </button>
              <button
                className={cn(
                  'px-3 py-1.5 transition-colors',
                  lang === 'ka' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                )}
                onClick={() => setLang('ka')}
              >
                KA
              </button>
            </div>
          </div>

          {/* Question Prompt */}
          <div>
            <Label className="text-xs text-muted-foreground">Question</Label>
            <p className="text-sm font-medium mt-1">
              {getLocalizedTextByLang(hydratedQuestion.prompt, lang, 'Untitled Question')}
            </p>
          </div>

          {/* Options (for MCQ) */}
          {hydratedQuestion.type === 'mcq_single' && hydratedQuestion.payload?.type === 'mcq_single' && (
            <div>
              <Label className="text-xs text-muted-foreground">Options</Label>
              <div className="space-y-2 mt-1">
                {hydratedQuestion.payload.options.map((option, index) => (
                  <div
                    key={option.id}
                    className={cn(
                      'flex items-center gap-2 p-3 rounded-lg border text-sm',
                      option.is_correct
                        ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
                        : 'border-gray-200 bg-gray-50'
                    )}
                  >
                    <span className="font-semibold">
                      {String.fromCharCode(65 + index)})
                    </span>
                    <span className="flex-1">{getLocalizedTextByLang(option.text, lang)}</span>
                    {option.is_correct && (
                      <CheckCircle2 className="ml-auto h-4 w-4 text-green-600" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Accepted Answers (for Text Input) */}
          {hydratedQuestion.type === 'input_text' && hydratedQuestion.payload?.type === 'input_text' && (
            <div>
              <Label className="text-xs text-muted-foreground">Accepted Answers</Label>
              <div className="space-y-1 mt-1">
                {hydratedQuestion.payload.accepted_answers.map((answer, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 bg-gray-50 text-sm"
                  >
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>{getLocalizedTextByLang(answer, lang)}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Case sensitive: {hydratedQuestion.payload.case_sensitive ? 'Yes' : 'No'}
              </p>
            </div>
          )}

          {/* Explanation */}
          {hydratedQuestion.explanation && (
            <div>
              <Label className="text-xs text-muted-foreground">Explanation</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {getLocalizedTextByLang(hydratedQuestion.explanation, lang)}
              </p>
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex gap-2 pt-2 border-t">
            <Button
              size="sm"
              variant={hydratedQuestion.status === 'published' ? 'outline' : 'default'}
              onClick={handleToggleStatus}
              className="flex-1"
              disabled={updateStatus.isPending}
            >
              {hydratedQuestion.status === 'published' ? (
                <>
                  <EyeOff className="mr-2 h-3 w-3" />
                  Unpublish
                </>
              ) : (
                <>
                  <Eye className="mr-2 h-3 w-3" />
                  Publish
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleEdit}
            >
              <Edit className="mr-2 h-3 w-3" />
              Edit
            </Button>
            <Button
              size="sm"
              variant={confirmDelete ? 'destructive' : 'outline'}
              onClick={handleDelete}
              disabled={deleteQuestion.isPending}
              className={cn(!confirmDelete && 'text-red-500 hover:text-red-600 hover:bg-red-50')}
            >
              <Trash2 className="mr-2 h-3 w-3" />
              {confirmDelete ? 'Confirm?' : 'Delete'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
