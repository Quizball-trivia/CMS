/**
 * What the API checks beyond each type's schema (apps/api content model), and
 * the fields a row keeps from its creation (migration 0013's fixed columns).
 * Shared by the forms and the mock API.
 */
import type { TdContentType } from './admin-api';
import { checkContract, type SchemaIssue } from './contract';
import { t } from './i18n';

type Data = Record<string, unknown>;

export const TD_FIXED_FIELDS: Record<TdContentType, readonly string[]> = {
  'card-categories': ['key'],
  cards: ['categoryKey', 'key'],
  'whoami-subjects': ['key'],
  'box-categories': ['key'],
  'box-questions': ['categoryKey', 'key'],
  'penalty-questions': ['key'],
  'practice-questions': ['key'],
  media: ['key'],
  clubs: ['key'],
  'football-logic': ['key'],
  'put-in-order': ['key'],
  'career-path': ['key'],
  'daily-schedule': ['game', 'date'],
  'daily-settings': ['game'],
};

/**
 * Data fields that only make sense together, merged as one unit when an edit
 * conflicts (merge.ts): a question with its answer and options, an answer
 * with its spellings and clues, an image with its size and credits, a round
 * with the order its prompt asks for.
 */
export const TD_MERGE_UNITS: Record<TdContentType, readonly (readonly string[])[]> = {
  'card-categories': [],
  cards: [['value', 'display', 'aliases', 'lines', 'photo', 'imageKey']],
  'whoami-subjects': [['display', 'aliases', 'clues']],
  'box-categories': [],
  'box-questions': [['q', 'display', 'aliases']],
  'penalty-questions': [['q', 'display', 'aliases']],
  'practice-questions': [['difficulty', 'prompt', 'options', 'answer', 'explanation', 'imageKey']],
  media: [['url', 'uploadId', 'width', 'height', 'author', 'license', 'source']],
  clubs: [['label', 'value'], ['crest', 'crestImageKey']],
  'football-logic': [['category', 'prompt', 'imageA', 'imageB', 'imageAKey', 'imageBKey', 'displayAnswer', 'acceptedAnswers']],
  'put-in-order': [['prompt', 'items']],
  'career-path': [['prompt', 'displayAnswer', 'acceptedAnswers', 'clubs']],
  'daily-schedule': [],
  'daily-settings': [['seconds', 'cycle']],
};

export function contentRuleIssues(type: TdContentType, data: Data): SchemaIssue[] {
  switch (type) {
    case 'practice-questions':
      return Array.isArray(data.options) && Number(data.answer) < data.options.length
        ? []
        : [{ path: 'data.answer', message: t('the answer is not one of the options') }];
    case 'media':
      return (data.url === null) !== (data.uploadId === null)
        ? []
        : [{ path: 'data.uploadId', message: t('an image is an upload (or, kept from before, a URL): exactly one') }];
    case 'put-in-order': {
      const keys = Array.isArray(data.items) ? (data.items as Data[]).map((item) => item.key) : [];
      return new Set(keys).size === keys.length ? [] : [{ path: 'data.items', message: t('item keys repeat') }];
    }
    case 'daily-settings':
      return (data.game === 'careerPath') === (data.seconds === null)
        ? []
        : [{ path: 'data.seconds', message: t('Football Logic and Put in Order have seconds; Career Path has none') }];
    default:
      return [];
  }
}

/** What the CMS asks of content beyond what the API refuses (the mock API, which mirrors the API, does not ask it):
 *  a Round II subject with fewer than five clues is never played (game-core MATCH_SIZES.buzzerClues), a Football
 *  Logic question with neither text nor a picture shows the player nothing, and a card's
 *  SoFIFA photo is served only for a number of up to seven digits and a two-digit version (the face routes). */
export function editorialIssues(type: TdContentType, data: Data): SchemaIssue[] {
  if (type === 'whoami-subjects' && !(Array.isArray(data.clues) && data.clues.length >= 5))
    return [{ path: 'data.clues', message: t('Round II needs at least 5 clues: a match shows the first 5') }];
  if (type === 'football-logic' && !String(data.prompt ?? '').trim() && ![data.imageA, data.imageB, data.imageAKey, data.imageBKey].some(Boolean))
    return [{ path: 'data.prompt', message: t('A question needs its text or a picture') }];
  if (type === 'cards' && data.photo && typeof data.photo === 'object') {
    const { id, ver } = data.photo as { id?: unknown; ver?: unknown };
    return [
      ...(typeof id === 'number' && Number.isInteger(id) && id >= 1 && id <= 9_999_999 ? [] : [{ path: 'data.photo.id', message: t('A SoFIFA player number has at most seven digits') }]),
      ...(typeof ver === 'string' && /^\d{2}$/.test(ver) ? [] : [{ path: 'data.photo.ver', message: t('Two digits, such as 24: no face is shown for anything else.') }]),
    ];
  }
  return [];
}

/** Everything the API would refuse in a create or edit body, by path (`data.aliases.0`), before it is sent. */
export function contentWriteIssues(
  type: TdContentType,
  schemaName: string,
  mode: 'create' | 'edit',
  body: { data: Data; position?: number; note?: string; version?: number },
): SchemaIssue[] {
  const shape = checkContract(`${schemaName}${mode === 'create' ? 'CreateRequest' : 'EditRequest'}`, body);
  return shape.length ? shape : contentRuleIssues(type, body.data);
}
