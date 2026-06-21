import { apiClient } from './api-client';
import type {
  CommitResult,
  PreviewResult,
  PlayerClueCardDetail,
  ClueCardLocale,
  ClueCardDifficulty,
  ClueCardImportStatus,
  ClueCardStatus,
  CommitRow,
} from '@/types';

const BASE_PATH = '/admin/player-clue-cards';

export interface PreviewImportParams {
  text: string;
  locale: ClueCardLocale;
  promptVersion?: string;
  defaultDifficulty?: ClueCardDifficulty;
  style?: string;
}

export interface CommitImportParams {
  locale: ClueCardLocale;
  promptVersion?: string;
  defaultDifficulty?: ClueCardDifficulty;
  status?: ClueCardImportStatus;
  force?: boolean;
  rows: CommitRow[];
}

export interface UpdateStatusParams {
  status: ClueCardStatus;
  reviewNotes?: string | null;
  rejectionReason?: string | null;
}

export interface BulkUpdateStatusParams {
  ids: string[];
  status: 'approved' | 'published' | 'rejected';
  reviewNotes?: string | null;
}

export const playerClueCardsService = {
  async previewImport(params: PreviewImportParams): Promise<PreviewResult> {
    return apiClient.post<PreviewResult>(`${BASE_PATH}/import/preview`, params, {
      timeoutMs: 120_000,
    });
  },

  async commitImport(params: CommitImportParams): Promise<CommitResult> {
    return apiClient.post<CommitResult>(`${BASE_PATH}/import/commit`, params, {
      timeoutMs: 300_000,
    });
  },

  async updateStatus(id: string, params: UpdateStatusParams): Promise<PlayerClueCardDetail> {
    return apiClient.patch<PlayerClueCardDetail>(`${BASE_PATH}/${id}/status`, params);
  },

  async bulkUpdateStatus(params: BulkUpdateStatusParams): Promise<{ updated: number }> {
    return apiClient.patch<{ updated: number }>(`${BASE_PATH}/status/bulk`, params);
  },
};
