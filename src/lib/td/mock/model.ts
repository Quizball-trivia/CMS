/**
 * How each content type behaves, as the API's content model has it: identity
 * (unique key), the list filters and natural order, references. The rules
 * beyond the shape and the fixed fields are shared with the forms
 * (content-rules.ts).
 */
import type { TdContentType } from '../admin-api';
import { contentRuleIssues, TD_FIXED_FIELDS } from '../content-rules';

export type Data = Record<string, unknown>;

export interface Ref {
  type: TdContentType;
  key: string;
  path: string;
}

export interface MockModel {
  identity(data: Data): string;
  fixed: readonly string[];
  label(data: Data): string;
  natural: (data: Data, position: number) => string | number;
  filters: { category?: string; puzzle?: string; game?: string; date?: string };
  rules(data: Data): { path: string; message: string }[];
  /** Content this refers to by key, which must exist (a foreign key). */
  refs(data: Data): Ref[];
}

const byKey = (data: Data) => String(data.key);
const image = (field: string) => (data: Data): Ref[] =>
  data[field] === null || data[field] === undefined ? [] : [{ type: 'media', key: String(data[field]), path: `data.${field}` }];

type Shape = Partial<Omit<MockModel, 'fixed' | 'rules'>>;

const inCategory = (parent: TdContentType, extra: (data: Data) => Ref[] = () => []): Shape => ({
  identity: (data) => `${String(data.categoryKey)}/${String(data.key)}`,
  label: (data) => `${String(data.categoryKey)}/${String(data.key)}`,
  filters: { category: 'categoryKey' },
  refs: (data) => [{ type: parent, key: String(data.categoryKey), path: 'data.categoryKey' }, ...extra(data)],
});

const SHAPES: Record<TdContentType, Shape> = {
  'card-categories': {},
  cards: inCategory('card-categories', image('imageKey')),
  'whoami-subjects': {},
  'box-categories': {},
  'box-questions': inCategory('box-categories'),
  'penalty-questions': {},
  'practice-questions': { filters: { category: 'category' }, refs: image('imageKey') },
  media: {},
  clubs: { refs: image('crestImageKey') },
  'football-logic': { filters: { category: 'category', puzzle: 'puzzle' }, refs: (data) => [...image('imageAKey')(data), ...image('imageBKey')(data)] },
  'put-in-order': { filters: { puzzle: 'puzzle' } },
  'career-path': {
    filters: { puzzle: 'puzzle' },
    refs: (data) =>
      (data.clubs as Data[]).flatMap((club, i) =>
        club.clubKey === null ? [] : [{ type: 'clubs' as const, key: String(club.clubKey), path: `data.clubs.${i}.clubKey` }],
      ),
  },
  'daily-schedule': {
    identity: (data) => `${String(data.game)}/${String(data.date)}`,
    label: (data) => `${String(data.game)} ${String(data.date)}`,
    natural: (data) => String(data.date),
    filters: { game: 'game', puzzle: 'puzzle', date: 'date' },
  },
  'daily-settings': {
    identity: (data) => String(data.game),
    label: (data) => String(data.game),
    natural: (data) => String(data.game),
    filters: { game: 'game' },
  },
};

export const MOCK_MODELS = Object.fromEntries(
  (Object.entries(SHAPES) as [TdContentType, Shape][]).map(([type, shape]) => [
    type,
    {
      identity: byKey,
      label: byKey,
      natural: (_data: Data, position: number) => position,
      filters: {},
      refs: () => [],
      ...shape,
      fixed: TD_FIXED_FIELDS[type],
      rules: (data: Data) => contentRuleIssues(type, data),
    } satisfies MockModel,
  ]),
) as Record<TdContentType, MockModel>;

/** The children a category approves with it. */
export const CHILD_TYPE: Partial<Record<TdContentType, TdContentType>> = {
  'card-categories': 'cards',
  'box-categories': 'box-questions',
};

/** The daily question type of a game. */
export const DAILY_TYPE = {
  footballLogic: 'football-logic',
  putInOrder: 'put-in-order',
  careerPath: 'career-path',
} as const satisfies Record<string, TdContentType>;
