'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { ErrorFeedbackDialogState } from '@/components/error-feedback-dialog';
import { getErrorFeedback, getErrorLogDetails, getErrorResolutionGuidance, getErrorTechnicalDetails } from '@/lib/error-feedback';
import { logger, type LogModule } from '@/lib/logger';

interface ShowErrorFeedbackOptions {
  fallbackTitle: string;
  logModule?: LogModule;
  logMessage?: string;
  logData?: Record<string, unknown>;
}

export function useErrorFeedbackDialog() {
  const [feedback, setFeedback] = useState<ErrorFeedbackDialogState | null>(null);

  const showErrorFeedback = useCallback((error: unknown, options: ShowErrorFeedbackOptions) => {
    const userFeedback = getErrorFeedback(error, options.fallbackTitle);
    const logDetails = {
      ...options.logData,
      ...getErrorLogDetails(error),
    };

    logger.error(
      options.logModule ?? 'general',
      options.logMessage ?? options.fallbackTitle,
      logDetails
    );

    if (userFeedback.description) {
      toast.error(userFeedback.title, { description: userFeedback.description });
    } else {
      toast.error(userFeedback.title);
    }

    setFeedback({
      ...userFeedback,
      guidance: getErrorResolutionGuidance(error),
      technicalDetails: getErrorTechnicalDetails(error),
    });
  }, []);

  const closeErrorFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  return {
    errorFeedback: feedback,
    showErrorFeedback,
    closeErrorFeedback,
  };
}
