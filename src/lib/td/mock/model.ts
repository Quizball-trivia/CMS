/**
 * How each content type behaves, as the API's content model and migrations
 * 0013/0015 have it: identity (unique key), fields fixed once created, the
 * list filters and natural order, rules beyond the shape, references.
 */
import type { TdContentType } from '../admin-api';

export type Data = Record<string, unknown>;

export interface Ref {
  type: TdContentType;
  key: string;
  path: string;
}

export interface MockModel {
  identity(data: Data): string;
  fixed: string[];
  label(data: Data): string;
  natural: (data: Data, position: number) => string | number;
  filters: { category?: string; puzzle?: string; game?: string; date?: string };
  rules(data: Data): { path: string; message: string }[];
  /** Content this refers to by key, which must exist (a foreign key). */
  refs(data: Data): Ref[];
  /** The parent of a card or box question. */
  parent?: { type: TdContentType; field: string };
}

const byKey = (data: Data) => String(data.key);
const image = (field: string) => (data: Data): Ref[] =>
  data[field] === null || data[field] === undefined ? [] : [{ type: 'media', key: String(data[field]), path: `data.${field}` }];

const base: MockModel = {
  identity: byKey,
  fixed: ['key'],
  label: byKey,
  natural: (_data, position) => position,
  filters: {},
  rules: () => [],
  refs: () => [],
};

const inCategory = (parent: TdContentType): Partial<MockModel> => ({
  identity: (data) => `${String(data.categoryKey)}/${String(data.key)}`,
  fixed: ['categoryKey', 'key'],
  label: (data) => `${String(data.categoryKey)}/${String(data.key)}`,
  filters: { category: 'categoryKey' },
  parent: { type: parent, field: 'categoryKey' },
});

export const MOCK_MODELS: Record<TdContentType, MockModel> = {
  'card-categories': base,
  cards: {
    ...base,
    ...inCategory('card-categories'),
    refs: (data) => [{ type: 'card-categories', key: String(data.categoryKey), path: 'data.categoryKey' }, ...image('imageKey')(data)],
  },
  'whoami-subjects': base,
  'box-categories': base,
  'box-questions': {
    ...base,
    ...inCategory('box-categories'),
    refs: (data) => [{ type: 'box-categories', key: String(data.categoryKey), path: 'data.categoryKey' }],
  },
  'penalty-questions': base,
  'practice-questions': {
    ...base,
    filters: { category: 'category' },
    rules: (data) =>
      Number(data.answer) < (data.options as unknown[]).length ? [] : [{ path: 'data.answer', message: 'the answer is not one of the options' }],
    refs: image('imageKey'),
  },
  media: {
    ...base,
    rules: (data) =>
      (data.url === null) !== (data.uploadId === null)
        ? []
        : [{ path: 'data.uploadId', message: 'an image is an upload (or, kept from before, a URL): exactly one' }],
  },
  clubs: { ...base, refs: image('crestImageKey') },
  'football-logic': { ...base, filters: { category: 'category', puzzle: 'puzzle' } },
  'put-in-order': {
    ...base,
    filters: { puzzle: 'puzzle' },
    rules: (data) => {
      const keys = (data.items as Data[]).map((item) => item.key);
      return new Set(keys).size === keys.length ? [] : [{ path: 'data.items', message: 'item keys repeat' }];
    },
  },
  'career-path': {
    ...base,
    filters: { puzzle: 'puzzle' },
    refs: (data) =>
      (data.clubs as Data[]).flatMap((club, i) =>
        club.clubKey === null ? [] : [{ type: 'clubs' as const, key: String(club.clubKey), path: `data.clubs.${i}.clubKey` }],
      ),
  },
  'daily-schedule': {
    ...base,
    identity: (data) => `${String(data.game)}/${String(data.date)}`,
    fixed: ['game', 'date'],
    label: (data) => `${String(data.game)} ${String(data.date)}`,
    natural: (data) => String(data.date),
    filters: { game: 'game', puzzle: 'puzzle', date: 'date' },
  },
  'daily-settings': {
    ...base,
    identity: (data) => String(data.game),
    fixed: ['game'],
    label: (data) => String(data.game),
    natural: (data) => String(data.game),
    filters: { game: 'game' },
    rules: (data) =>
      (data.game === 'careerPath') === (data.seconds === null)
        ? []
        : [{ path: 'data.seconds', message: 'Football Logic and Put in Order have seconds; Career Path has none' }],
  },
};

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
