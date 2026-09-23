export type GridReportStatus = 'open' | 'accepted' | 'rejected' | 'duplicate' | 'closed';
export type GridLocale = 'en' | 'ka' | 'es' | 'tr';
export type GridAliasPolicy = 'exact' | 'unique_only' | 'safe_typo';

export interface GridPlayerCheck {
  playerId: string;
  playerName: string;
  rowMember: boolean;
  columnMember: boolean;
  boardAnswer: boolean;
  submittedNameRecognized: boolean;
  otherAliasOwners: number;
}

export interface GridCorrectionProposal {
  playerId: string;
  names: Record<GridLocale, string>;
  aliases: Array<{ locale: GridLocale; value: string; acceptancePolicy: GridAliasPolicy }>;
  evidenceUrl?: string;
  evidenceNote?: string;
  reviewerNote?: string;
}

export interface GridReport {
  id: string;
  attempt_id: string;
  status: GridReportStatus;
  created_at: string;
  reported_at?: string;
  submitted_text: string;
  normalized_text: string | null;
  locale: GridLocale;
  outcome: string;
  cell_index: number;
  board_theme: string;
  content_release_id: string;
  content_release_version: number;
  row_criterion_key: string;
  column_criterion_key: string;
  row_label_en: string;
  row_label_ka: string;
  row_label_es: string | null;
  row_label_tr: string | null;
  column_label_en: string;
  column_label_ka: string;
  column_label_es: string | null;
  column_label_tr: string | null;
  reviewer_notes: string | null;
  decision_release_id: string | null;
  correction_proposal: (GridCorrectionProposal & { version: number; check: GridPlayerCheck }) | null;
  proposed_at: string | null;
}

export interface GridPlayerSearchResult {
  id: string;
  name: string;
  display_name: Partial<Record<GridLocale, string>>;
  in_grid_catalog: boolean;
}
