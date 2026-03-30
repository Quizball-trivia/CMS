'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
import { Languages, CheckCircle2, Loader2 } from 'lucide-react';
import { questionsService } from '@/services/questions.service';
import { questionKeys } from '@/hooks/use-questions';
import { categoryKeys } from '@/hooks/use-categories';

const POLL_INTERVAL_MS = 3000;

export function TranslateBackfillDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [total, setTotal] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [nothingToTranslate, setNothingToTranslate] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const startPolling = useCallback((totalCount: number) => {
    setIsPolling(true);
    setTotal(totalCount);
    setRemaining(totalCount);

    pollRef.current = setInterval(async () => {
      try {
        const status = await questionsService.translateStatus();
        setRemaining(status.questions);

        if (status.questions === 0) {
          stopPolling();
          setIsDone(true);
          queryClient.invalidateQueries({ queryKey: questionKeys.all });
          queryClient.invalidateQueries({ queryKey: categoryKeys.all });
          toast.success(`Successfully translated ${totalCount} questions to Georgian`);
        }
      } catch {
        // Silently retry on next interval
      }
    }, POLL_INTERVAL_MS);
  }, [queryClient, stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleTranslate = async () => {
    setIsStarting(true);
    setIsDone(false);
    setNothingToTranslate(false);

    try {
      const res = await questionsService.translateBackfill();

      if (res.status === 'done') {
        setNothingToTranslate(true);
        queryClient.invalidateQueries({ queryKey: questionKeys.all });
        queryClient.invalidateQueries({ queryKey: categoryKeys.all });
        toast.info('All questions are already translated');
      } else {
        startPolling(res.total);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to start translation'
      );
    } finally {
      setIsStarting(false);
    }
  };

  const handleClose = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      // Don't stop polling — let it continue in background
      // Just reset UI state
      if (!isPolling) {
        setTotal(0);
        setRemaining(0);
        setIsDone(false);
        setNothingToTranslate(false);
      }
    }
  };

  const translated = total - remaining;
  const progressPct = total > 0 ? Math.round((translated / total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Languages className="mr-2 h-4 w-4" />
          Translate All
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Translate Questions to Georgian</DialogTitle>
          <DialogDescription>
            Translate all English questions that don&apos;t have a Georgian translation yet.
            Categories will also be translated.
          </DialogDescription>
        </DialogHeader>

        {/* Nothing to translate */}
        {nothingToTranslate && (
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold text-sm">Everything is already translated!</span>
            </div>
          </div>
        )}

        {/* Progress */}
        {(isPolling || isDone) && (
          <div className="space-y-4 py-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
                <span className={isDone ? 'text-green-600 font-semibold' : 'text-muted-foreground'}>
                  {isDone ? 'Translation complete!' : 'Translating...'}
                </span>
              </div>
              <span className="font-semibold tabular-nums">
                {translated} / {total}
              </span>
            </div>

            <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${
                  isDone ? 'bg-green-500' : 'bg-primary'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              {isDone
                ? `All ${total} questions translated successfully.`
                : `${remaining} questions remaining. Processing in batches of 100...`}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            {isDone || nothingToTranslate ? 'Close' : isPolling ? 'Close (continues in background)' : 'Cancel'}
          </Button>
          {!isPolling && !isDone && !nothingToTranslate && (
            <Button onClick={handleTranslate} disabled={isStarting}>
              {isStarting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                'Start Translation'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
