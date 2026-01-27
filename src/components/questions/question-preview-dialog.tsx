'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useUpdateQuestionStatus } from '@/hooks';
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
import { Eye, EyeOff, Edit, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { getLocalizedText } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

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
  const router = useRouter();
  const updateStatus = useUpdateQuestionStatus();

  const totalQuestions = allQuestions.length;
  const hasPrevious = activeIndex > 0;
  const hasNext = activeIndex < totalQuestions - 1;
  const showLoadingIndicator = totalAvailable > totalQuestions;

  // Use the question at activeIndex if we're navigating, otherwise use the prop
  const displayQuestion = allQuestions.length > 0 ? allQuestions[activeIndex] : question;

  // Reset activeIndex when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setActiveIndex(currentIndex);
    }
  };

  // Handle navigation
  const handleNavigate = useCallback((newIndex: number) => {
    setActiveIndex(newIndex);
    if (onNavigate) {
      onNavigate(newIndex);
    }
  }, [onNavigate]);

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

  const getDifficultyVariant = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'medium':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'hard':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const handleToggleStatus = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus: QuestionStatus = displayQuestion.status === 'published' ? 'draft' : 'published';

    try {
      await updateStatus.mutateAsync({ id: displayQuestion.id, data: { status: newStatus } });
      toast.success(`Question ${newStatus === 'published' ? 'published' : 'unpublished'}`);
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    router.push(`/questions/${displayQuestion.id}`);
  };

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
          {/* Header with badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={cn('border', getDifficultyVariant(displayQuestion.difficulty))}>
              {displayQuestion.difficulty}
            </Badge>
            <Badge variant="outline">{displayQuestion.type}</Badge>
            <Badge
              variant={displayQuestion.status === 'published' ? 'default' : 'secondary'}
            >
              {displayQuestion.status}
            </Badge>
          </div>

          {/* Question Prompt */}
          <div>
            <Label className="text-xs text-muted-foreground">Question</Label>
            <p className="text-sm font-medium mt-1">
              {getLocalizedText(displayQuestion.prompt, 'Untitled Question')}
            </p>
          </div>

          {/* Options (for MCQ) */}
          {displayQuestion.type === 'mcq_single' && displayQuestion.payload?.type === 'mcq_single' && (
            <div>
              <Label className="text-xs text-muted-foreground">Options</Label>
              <div className="space-y-2 mt-1">
                {displayQuestion.payload.options.map((option, index) => (
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
                    <span className="flex-1">{getLocalizedText(option.text)}</span>
                    {option.is_correct && (
                      <CheckCircle2 className="ml-auto h-4 w-4 text-green-600" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Accepted Answers (for Text Input) */}
          {displayQuestion.type === 'input_text' && displayQuestion.payload?.type === 'input_text' && (
            <div>
              <Label className="text-xs text-muted-foreground">Accepted Answers</Label>
              <div className="space-y-1 mt-1">
                {displayQuestion.payload.accepted_answers.map((answer, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 bg-gray-50 text-sm"
                  >
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>{getLocalizedText(answer)}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Case sensitive: {displayQuestion.payload.case_sensitive ? 'Yes' : 'No'}
              </p>
            </div>
          )}

          {/* Explanation */}
          {displayQuestion.explanation && (
            <div>
              <Label className="text-xs text-muted-foreground">Explanation</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {getLocalizedText(displayQuestion.explanation)}
              </p>
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex gap-2 pt-2 border-t">
            <Button
              size="sm"
              variant={displayQuestion.status === 'published' ? 'outline' : 'default'}
              onClick={handleToggleStatus}
              className="flex-1"
              disabled={updateStatus.isPending}
            >
              {displayQuestion.status === 'published' ? (
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
