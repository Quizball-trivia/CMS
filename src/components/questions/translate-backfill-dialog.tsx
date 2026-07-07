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
import { logger } from '@/lib/logger';
import { getErrorLogDetails } from '@/lib/error-feedback';
import { useErrorFeedbackDialog } from '@/hooks/use-error-feedback-dialog';
import { ErrorFeedbackDialog } from '@/components/error-feedback-dialog';

const POLL_INTERVAL_MS = 3000;

export function TranslateBackfillDialog({ scope = 'all' }: { scope?: 'all' | 'agents' } = {}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [total, setTotal] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [nothingToTranslate, setNothingToTranslate] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idlePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [idleCounts, setIdleCounts] = useState<{ questions: number; categories: number; agentTotal?: number } | null>(null);
  const [idleShrinking, setIdleShrinking] = useState(false);
  const pollErrorCountRef = useRef(0);
  const { errorFeedback, showErrorFeedback, closeErrorFeedback } = useErrorFeedbackDialog();

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
        const status = await questionsService.translateStatus(scope);
        pollErrorCountRef.current = 0;
        setRemaining(status.questions);

        if (status.questions === 0) {
          stopPolling();
          setIsDone(true);
          queryClient.invalidateQueries({ queryKey: questionKeys.all });
          queryClient.invalidateQueries({ queryKey: categoryKeys.all });
          toast.success(`Successfully translated ${totalCount} questions to Georgian`);
        }
      } catch (error) {
        pollErrorCountRef.current += 1;
        logger.error('questions', 'Translation status poll failed', {
          attempt: pollErrorCountRef.current,
          ...getErrorLogDetails(error),
        });

        if (pollErrorCountRef.current >= 3) {
          stopPolling();
          showErrorFeedback(error, {
            fallbackTitle: 'Translation status check failed',
            logModule: 'questions',
            logMessage: 'Translation status polling stopped after repeated failures',
            logData: {
              attempts: pollErrorCountRef.current,
              totalCount,
              remaining,
            },
          });
        }
      }
    }, POLL_INTERVAL_MS);
  }, [queryClient, remaining, showErrorFeedback, stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (idlePollRef.current) clearInterval(idlePollRef.current);
    };
  }, []);

  // While the dialog is open in the idle state, keep the "currently missing"
  // count fresh — and if it's shrinking, a backfill is already running in the
  // background (e.g. started earlier and the dialog was closed/reopened).
  useEffect(() => {
    if (!open || isPolling) {
      if (idlePollRef.current) {
        clearInterval(idlePollRef.current);
        idlePollRef.current = null;
      }
      return;
    }
    let prev: number | null = null;
    const tick = async () => {
      try {
        const c = await questionsService.translateStatus(scope);
        setIdleCounts(c);
        if (prev != null && c.questions < prev) setIdleShrinking(true);
        if (c.questions === 0) setIdleShrinking(false);
        prev = c.questions;
      } catch {
        /* non-fatal */
      }
    };
    void tick();
    idlePollRef.current = setInterval(tick, 5000);
    return () => {
      if (idlePollRef.current) {
        clearInterval(idlePollRef.current);
        idlePollRef.current = null;
      }
    };
  }, [open, isPolling]);

  const handleTranslate = async (mode: 'missing' | 'redoDrafts' = 'missing') => {
    if (
      mode === 'redoDrafts' &&
      !window.confirm(
        'Re-translate ALL agent-generated questions from scratch (drafts + approved)? Their current Georgian — including any manual edits — will be overwritten. Hand-written questions from the original bank are not touched.'
      )
    ) {
      return;
    }
    setIsStarting(true);
    setIsDone(false);
    setNothingToTranslate(false);
    pollErrorCountRef.current = 0;

    try {
      const res =
        mode === 'redoDrafts'
          ? await questionsService.translateRedoDrafts()
          : await questionsService.translateBackfill(scope);
      logger.info('questions', 'Translation backfill started', res);

      if (res.status === 'done') {
        setNothingToTranslate(true);
        queryClient.invalidateQueries({ queryKey: questionKeys.all });
        queryClient.invalidateQueries({ queryKey: categoryKeys.all });
        toast.info('All questions are already translated');
      } else {
        startPolling(res.total);
      }
    } catch (error) {
      showErrorFeedback(error, {
        fallbackTitle: 'Failed to start translation',
        logModule: 'questions',
        logMessage: 'Failed to start translation backfill',
      });
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
      <ErrorFeedbackDialog feedback={errorFeedback} onOpenChange={(isOpen) => {
        if (!isOpen) closeErrorFeedback();
      }} />
      <DialogTrigger asChild>
        <Button variant="outline">
          <Languages className="mr-2 h-4 w-4" />
          Translate All
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Translate Questions to Georgian</DialogTitle>
          <DialogDescription>Choose how to translate:</DialogDescription>
        </DialogHeader>

        {!isPolling && !isDone && !nothingToTranslate && idleShrinking && idleCounts ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            A translation run is already in progress — {idleCounts.questions.toLocaleString()} remaining. The count
            updates every few seconds.
          </div>
        ) : null}

        {!isPolling && !isDone && !nothingToTranslate && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleTranslate('missing')}
              disabled={isStarting}
              className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4 text-slate-500" />}
                Translate missing only
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {scope === 'agents'
                  ? 'Fills Georgian only where it\u2019s empty — AGENT-GENERATED questions only (drafts and approved). The rest of the question bank is never touched.'
                  : 'Fills Georgian only where it\u2019s empty — questions, options, and category names. Existing translations are never touched. Safe to run anytime.'}
              </p>
              {idleCounts ? (
                <p className="mt-1.5 text-xs font-semibold text-slate-700">
                  {idleCounts.questions.toLocaleString()} question{idleCounts.questions === 1 ? '' : 's'}
                  {idleCounts.categories ? ` + ${idleCounts.categories} categories` : ''} currently missing Georgian
                </p>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => handleTranslate('redoDrafts')}
              disabled={isStarting}
              className="w-full rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-left transition hover:border-amber-300 hover:bg-amber-50 disabled:opacity-50"
            >
              <div className="text-sm font-semibold text-amber-800">Re-translate agent questions (overwrite)</div>
              <p className="mt-1 text-xs text-amber-700">
                Wipes and redoes the Georgian of every <b>agent-generated</b> question — drafts in review AND already
                approved ones (their old in-pipeline translations were poor). Manual edits to their Georgian are lost.
                Hand-written questions from the original bank are never touched.
              </p>
              {idleCounts?.agentTotal != null ? (
                <p className="mt-1.5 text-xs font-bold text-amber-800">
                  Will re-translate {idleCounts.agentTotal.toLocaleString()} agent question
                  {idleCounts.agentTotal === 1 ? '' : 's'}
                </p>
              ) : null}
            </button>
          </div>
        )}

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

        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
