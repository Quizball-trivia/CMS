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
import { playerClueCardsService } from '@/services/player-clue-cards.service';
import { logger } from '@/lib/logger';

const POLL_INTERVAL_MS = 3000;

/**
 * Translate All for auction clue cards. Mirrors the question panel's backfill:
 * the backend translates every en card missing a ka sibling, and we poll the
 * remaining count until it reaches zero.
 */
export function TranslateCluesDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [total, setTotal] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [nothingToTranslate, setNothingToTranslate] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollErrorCountRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const startPolling = useCallback(
    (totalCount: number) => {
      setIsPolling(true);
      setTotal(totalCount);
      setRemaining(totalCount);

      pollRef.current = setInterval(async () => {
        try {
          const status = await playerClueCardsService.translateStatus();
          pollErrorCountRef.current = 0;
          setRemaining(status.clues);

          if (status.clues === 0) {
            stopPolling();
            setIsDone(true);
            queryClient.invalidateQueries({ queryKey: ['auction', 'cards'] });
            toast.success(`Translated ${totalCount} clue cards to Georgian`);
          }
        } catch (error) {
          pollErrorCountRef.current += 1;
          logger.error('auction', 'Clue translation status poll failed', {
            attempt: pollErrorCountRef.current,
          });
          if (pollErrorCountRef.current >= 3) {
            stopPolling();
            toast.error('Translation status check failed. It may still be running.');
          }
        }
      }, POLL_INTERVAL_MS);
    },
    [queryClient, stopPolling]
  );

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleTranslate = async () => {
    setIsStarting(true);
    setIsDone(false);
    setNothingToTranslate(false);
    pollErrorCountRef.current = 0;

    try {
      const res = await playerClueCardsService.translateBackfill();
      logger.info('auction', 'Clue translation backfill started', res);

      if (res.status === 'done' && res.total === 0) {
        setNothingToTranslate(true);
        toast.info('All clue cards are already translated');
      } else {
        // The backend runs synchronously to completion, so we already know the
        // final counts — but poll once to reconcile the remaining indicator.
        startPolling(res.total);
        if (res.translated >= res.total) {
          stopPolling();
          setRemaining(0);
          setTotal(res.total);
          setIsDone(true);
          queryClient.invalidateQueries({ queryKey: ['auction', 'cards'] });
          toast.success(`Translated ${res.translated} clue cards to Georgian`);
        }
        if (res.failed > 0) {
          toast.warning(`${res.failed} card(s) failed to translate and were skipped.`);
        }
      }
    } catch (error) {
      logger.error('auction', 'Failed to start clue translation backfill', {});
      toast.error('Failed to start translation');
    } finally {
      setIsStarting(false);
    }
  };

  const handleClose = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen && !isPolling) {
      setTotal(0);
      setRemaining(0);
      setIsDone(false);
      setNothingToTranslate(false);
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
          <DialogTitle>Translate Clue Cards to Georgian</DialogTitle>
          <DialogDescription>
            Translate every English clue card that doesn&apos;t have a Georgian version yet.
            The player&apos;s first-person voice is preserved and names stay hidden.
          </DialogDescription>
        </DialogHeader>

        {nothingToTranslate && (
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold text-sm">Everything is already translated!</span>
            </div>
          </div>
        )}

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
                ? `All ${total} clue cards translated successfully.`
                : `${remaining} cards remaining...`}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            {isDone || nothingToTranslate ? 'Close' : 'Cancel'}
          </Button>
          {!isPolling && !isDone && !nothingToTranslate && (
            <Button onClick={handleTranslate} disabled={isStarting}>
              {isStarting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Translating...
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
