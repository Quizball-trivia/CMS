'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export interface ErrorFeedbackDialogState {
  title: string;
  description?: string;
  guidance: string[];
  technicalDetails?: Array<{ label: string; value: string }>;
}

interface ErrorFeedbackDialogProps {
  feedback: ErrorFeedbackDialogState | null;
  onOpenChange: (open: boolean) => void;
}

export function ErrorFeedbackDialog({ feedback, onOpenChange }: ErrorFeedbackDialogProps) {
  return (
    <Dialog open={Boolean(feedback)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertCircle className="h-5 w-5" />
          </div>
          <DialogTitle>{feedback?.title ?? 'Operation failed'}</DialogTitle>
          {feedback?.description && (
            <DialogDescription className="text-sm leading-6">
              {feedback.description}
            </DialogDescription>
          )}
        </DialogHeader>

        {feedback?.guidance.length ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h4 className="mb-2 text-sm font-semibold text-slate-900">How to fix it</h4>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {feedback.guidance.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {feedback?.technicalDetails?.length ? (
          <div className="rounded-lg border border-slate-200 p-4">
            <h4 className="mb-2 text-sm font-semibold text-slate-900">Technical details</h4>
            <dl className="space-y-1 text-sm">
              {feedback.technicalDetails.map((detail) => (
                <div key={detail.label} className="flex gap-2">
                  <dt className="min-w-24 text-slate-500">{detail.label}</dt>
                  <dd className="break-all font-mono text-xs text-slate-800">{detail.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
