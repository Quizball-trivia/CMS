import type { TdApiClient, TdRequestOptions } from './api-client';
import type * as C from './contract';

/** Every content type of the contract (path segment → its row and data). */
export interface TdContentTypes {
  'card-categories': { row: C.CardCategory; data: C.CardCategoryData };
  cards: { row: C.Card; data: C.CardData };
  'whoami-subjects': { row: C.WhoamiSubject; data: C.WhoamiSubjectData };
  'box-categories': { row: C.BoxCategory; data: C.BoxCategoryData };
  'box-questions': { row: C.BoxQuestion; data: C.BoxQuestionData };
  'penalty-questions': { row: C.PenaltyQuestion; data: C.PenaltyQuestionData };
  'practice-questions': { row: C.PracticeQuestion; data: C.PracticeQuestionData };
  media: { row: C.Media; data: C.MediaData };
  clubs: { row: C.Club; data: C.ClubData };
  'football-logic': { row: C.FootballLogic; data: C.FootballLogicData };
  'put-in-order': { row: C.PutInOrder; data: C.PutInOrderData };
  'career-path': { row: C.CareerPath; data: C.CareerPathData };
  'daily-schedule': { row: C.DailySchedule; data: C.DailyScheduleData };
  'daily-settings': { row: C.DailySettings; data: C.DailySettingsData };
}

export type TdContentType = keyof TdContentTypes;
export type TdContentRow<T extends TdContentType = TdContentType> = TdContentTypes[T]['row'];
export type TdContentData<T extends TdContentType = TdContentType> = TdContentTypes[T]['data'];
export type TdContentStatus = C.CardCategory['status'];

export interface TdContentList<T extends TdContentType = TdContentType> {
  items: TdContentRow<T>[];
  nextCursor: string | null;
}

/** Contract order; the contract's schema names are `${name}Data`, `${name}EditRequest`, … */
export const TD_CONTENT_SCHEMA_NAMES: Record<TdContentType, string> = {
  'card-categories': 'CardCategory',
  cards: 'Card',
  'whoami-subjects': 'WhoamiSubject',
  'box-categories': 'BoxCategory',
  'box-questions': 'BoxQuestion',
  'penalty-questions': 'PenaltyQuestion',
  'practice-questions': 'PracticeQuestion',
  media: 'Media',
  clubs: 'Club',
  'football-logic': 'FootballLogic',
  'put-in-order': 'PutInOrder',
  'career-path': 'CareerPath',
  'daily-schedule': 'DailySchedule',
  'daily-settings': 'DailySettings',
};

export const TD_CONTENT_TYPES = Object.keys(TD_CONTENT_SCHEMA_NAMES) as TdContentType[];

export type TdDailyGame = 'footballLogic' | 'putInOrder' | 'careerPath';

/** `?a=1&b=2` from the defined values, in order; empty when none. */
export function queryString(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

const segment = (id: string) => encodeURIComponent(id);

export interface TdContentWrite<T extends TdContentType> {
  data: TdContentData<T>;
  position?: number;
  note?: string;
}

export interface TdPageQuery {
  cursor?: string;
  limit?: number;
}

const page = ({ cursor, limit }: TdPageQuery = {}) => ({ cursor, limit });

/** One typed call per route of the pinned admin contract. */
export function createTdAdminApi(api: TdApiClient) {
  const content = <T extends TdContentType>(type: T) => {
    const base = `/admin/content/${type}`;
    return {
      list: (query: Omit<C.ContentListQuery, 'limit'> & { limit?: number } = {}, options?: TdRequestOptions) =>
        api.get<TdContentList<T>>(`${base}${queryString(query)}`, options),
      get: (id: string, options?: TdRequestOptions) => api.get<TdContentRow<T>>(`${base}/${segment(id)}`, options),
      history: (id: string, query?: TdPageQuery, options?: TdRequestOptions) =>
        api.get<C.ContentHistory>(`${base}/${segment(id)}/history${queryString(page(query))}`, options),
      create: (body: TdContentWrite<T>, options?: TdRequestOptions) => api.post<TdContentRow<T>>(base, body, options),
      edit: (id: string, body: TdContentWrite<T> & { version: number }, options?: TdRequestOptions) =>
        api.patch<TdContentRow<T>>(`${base}/${segment(id)}`, body, options),
      ready: (id: string, version: number, options?: TdRequestOptions) =>
        api.post<TdContentRow<T>>(`${base}/${segment(id)}/ready`, { version }, options),
      approve: (id: string, version: number, children?: C.ContentApproveRequest['children'], options?: TdRequestOptions) =>
        api.post<TdContentRow<T>>(
          `${base}/${segment(id)}/approve`,
          children?.length ? { version, children } : { version },
          options,
        ),
      archive: (id: string, version: number, options?: TdRequestOptions) =>
        api.post<TdContentRow<T>>(`${base}/${segment(id)}/archive`, { version }, options),
      restore: (id: string, version: number, options?: TdRequestOptions) =>
        api.post<TdContentRow<T>>(`${base}/${segment(id)}/restore`, { version }, options),
    };
  };

  return {
    content,
    imports: {
      preview: (items: unknown[], options?: TdRequestOptions) =>
        api.post<C.ContentImportReport>('/admin/content/imports/preview', { items }, options),
      apply: (batchKey: string, items: unknown[], options?: TdRequestOptions) =>
        api.post<C.ContentImportResult>('/admin/content/imports', { batchKey, items }, options),
      list: (query?: TdPageQuery, options?: TdRequestOptions) =>
        api.get<C.ContentImportBatchList>(`/admin/content/imports${queryString(page(query))}`, options),
      get: (id: string, options?: TdRequestOptions) => api.get<C.ContentImportBatch>(`/admin/content/imports/${segment(id)}`, options),
      undo: (id: string, options?: TdRequestOptions) =>
        api.post<C.ContentImportBatch>(`/admin/content/imports/${segment(id)}/undo`, undefined, options),
    },
    media: {
      upload: (file: Blob, contentType: string, options?: TdRequestOptions) =>
        api.request<C.MediaUpload>('POST', '/admin/media/uploads', { ...options, raw: { data: file, contentType } }),
      get: (id: string, options?: TdRequestOptions) => api.get<C.MediaUpload>(`/admin/media/uploads/${segment(id)}`, options),
      file: (id: string, options?: TdRequestOptions) =>
        api.request<Blob>('GET', `/admin/media/uploads/${segment(id)}/file`, { ...options, responseType: 'blob' }),
      remove: (id: string, options?: TdRequestOptions) => api.delete(`/admin/media/uploads/${segment(id)}`, options),
    },
    releases: {
      validate: (options?: TdRequestOptions) => api.post<C.ReleaseReport>('/admin/releases/validate', undefined, options),
      publish: (idemKey: string, options?: TdRequestOptions) =>
        api.post<C.Publication>('/admin/releases/publish', { idemKey }, options),
      rollback: (releaseId: string, idemKey: string, options?: TdRequestOptions) =>
        api.post<C.Publication>(`/admin/releases/${segment(releaseId)}/rollback`, { idemKey }, options),
      list: (query?: TdPageQuery, options?: TdRequestOptions) =>
        api.get<C.ReleaseList>(`/admin/releases${queryString(page(query))}`, options),
      get: (id: string, options?: TdRequestOptions) => api.get<C.ReleaseDetail>(`/admin/releases/${segment(id)}`, options),
      publication: (id: string, options?: TdRequestOptions) => api.get<C.Publication>(`/admin/publications/${segment(id)}`, options),
    },
    players: {
      search: (q: string, query?: TdPageQuery, options?: TdRequestOptions) =>
        api.get<C.AdminPlayerList>(`/admin/players${queryString({ q, ...page(query) })}`, options),
      get: (id: string, options?: TdRequestOptions) => api.get<C.AdminPlayer>(`/admin/players/${segment(id)}`, options),
      matches: (id: string, query?: TdPageQuery, options?: TdRequestOptions) =>
        api.get<C.AdminPlayerMatchList>(`/admin/players/${segment(id)}/matches${queryString(page(query))}`, options),
      tickets: (id: string, query?: TdPageQuery, options?: TdRequestOptions) =>
        api.get<C.AdminLedgerList>(`/admin/players/${segment(id)}/tickets${queryString(page(query))}`, options),
    },
    matches: {
      get: (id: string, options?: TdRequestOptions) => api.get<C.AdminMatchRecord>(`/admin/matches/${segment(id)}`, options),
      correct: (id: string, body: C.MatchCorrectionRequest, options?: TdRequestOptions) =>
        api.post<C.AdminMatchRecord>(`/admin/matches/${segment(id)}/corrections`, body, options),
    },
    leaderboard: {
      standings: (query?: TdPageQuery, options?: TdRequestOptions) =>
        api.get<C.BoardPage>(`/admin/leaderboard${queryString(page(query))}`, options),
      exportCsv: (options?: TdRequestOptions) =>
        api.request<string>('GET', '/admin/leaderboard/export', { ...options, responseType: 'text' }),
      snapshots: (query?: TdPageQuery, options?: TdRequestOptions) =>
        api.get<C.SnapshotList>(`/admin/leaderboard/snapshots${queryString(page(query))}`, options),
      takeSnapshot: (label: string, options?: TdRequestOptions) =>
        api.post<C.Snapshot>('/admin/leaderboard/snapshots', { label }, options),
      snapshot: (id: string, query?: TdPageQuery, options?: TdRequestOptions) =>
        api.get<C.SnapshotPage>(`/admin/leaderboard/snapshots/${segment(id)}${queryString(page(query))}`, options),
      exportSnapshotCsv: (id: string, options?: TdRequestOptions) =>
        api.request<string>('GET', `/admin/leaderboard/snapshots/${segment(id)}/export`, { ...options, responseType: 'text' }),
    },
    dashboard: (options?: TdRequestOptions) => api.get<C.Dashboard>('/admin/dashboard', options),
    reviews: {
      list: (status: 'open' | 'all' = 'open', query?: TdPageQuery, options?: TdRequestOptions) =>
        api.get<C.OpsReviewList>(`/admin/reviews${queryString({ status, ...page(query) })}`, options),
      dismiss: (id: string, note: string, options?: TdRequestOptions) =>
        api.post<C.OpsReview>(`/admin/reviews/${segment(id)}/dismiss`, { note }, options),
    },
    settings: {
      get: (options?: TdRequestOptions) => api.get<C.Settings>('/admin/settings', options),
      ticketsPerDay: (version: number, value: number, options?: TdRequestOptions) =>
        api.patch<C.Settings>('/admin/settings/tickets-per-day', { version, value }, options),
      maintenance: (version: number, enabled: boolean, options?: TdRequestOptions) =>
        api.patch<C.Settings>('/admin/settings/maintenance', { version, enabled }, options),
    },
  };
}

export type TdAdminApi = ReturnType<typeof createTdAdminApi>;
