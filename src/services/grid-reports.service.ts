import { apiClient } from './api-client';
import type {
  GridCorrectionProposal, GridPlayerCheck, GridPlayerSearchResult, GridReport, GridReportStatus,
} from '@/types/grid-reports';

const path = '/admin/football-grid';

export const gridReportsService = {
  async list(status?: GridReportStatus) {
    return apiClient.get<{ reports: GridReport[] }>(`${path}/missing-answer-reports`, { status, limit: 200 });
  },
  async searchPlayers(q: string) {
    return apiClient.get<{ players: GridPlayerSearchResult[] }>(`${path}/players/search`, { q });
  },
  async checkPlayer(reportId: string, playerId: string) {
    return apiClient.get<GridPlayerCheck>(`${path}/missing-answer-reports/${reportId}/player-check`, { playerId });
  },
  async saveProposal(reportId: string, proposal: GridCorrectionProposal) {
    return apiClient.put<{ id: string; correction_proposal: GridCorrectionProposal; proposed_at: string }>(
      `${path}/missing-answer-reports/${reportId}/proposal`, proposal,
    );
  },
  async decide(reportId: string, input: {
    status: Exclude<GridReportStatus, 'open'>;
    notes: string;
    decisionReleaseId?: string;
  }) {
    return apiClient.patch<void>(`${path}/missing-answer-reports/${reportId}`, input);
  },
};
