import { useMutation } from '@tanstack/react-query';
import { playerClueCardsService } from '@/services';
import type {
  CommitImportParams,
  PreviewImportParams,
  UpdateStatusParams,
  BulkUpdateStatusParams,
} from '@/services/player-clue-cards.service';
import { logger } from '@/lib/logger';
import { getErrorLogDetails } from '@/lib/error-feedback';

export function usePreviewPlayerClueImport() {
  return useMutation({
    mutationFn: (params: PreviewImportParams) => playerClueCardsService.previewImport(params),
    onError: (error) => {
      logger.error('auction', 'Failed to preview import', getErrorLogDetails(error));
    },
  });
}

export function useCommitPlayerClueImport() {
  return useMutation({
    mutationFn: (params: CommitImportParams) => playerClueCardsService.commitImport(params),
    onError: (error) => {
      logger.error('auction', 'Failed to commit import', getErrorLogDetails(error));
    },
  });
}

export function useUpdatePlayerClueCardStatus() {
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateStatusParams }) =>
      playerClueCardsService.updateStatus(id, data),
    onError: (error, variables) => {
      logger.error('auction', 'Failed to update card status', {
        id: variables.id,
        ...getErrorLogDetails(error),
      });
    },
  });
}

export function useBulkUpdatePlayerClueCardStatus() {
  return useMutation({
    mutationFn: (params: BulkUpdateStatusParams) => playerClueCardsService.bulkUpdateStatus(params),
    onError: (error) => {
      logger.error('auction', 'Failed to bulk update status', getErrorLogDetails(error));
    },
  });
}
