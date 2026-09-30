/**
 * What the API checks beyond each type's schema (apps/api content model), and
 * the fields a row keeps from its creation (migration 0013's fixed columns).
 * Shared by the forms and the mock API.
 */
import type { TdContentType } from './admin-api';
import { checkContract, type SchemaIssue } from './contract';

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

export function contentRuleIssues(type: TdContentType, data: Data): SchemaIssue[] {
  switch (type) {
    case 'practice-questions':
      return Array.isArray(data.options) && Number(data.answer) < data.options.length
        ? []
        : [{ path: 'data.answer', message: 'the answer is not one of the options' }];
    case 'media':
      return (data.url === null) !== (data.uploadId === null)
        ? []
        : [{ path: 'data.uploadId', message: 'an image is an upload (or, kept from before, a URL): exactly one' }];
    case 'put-in-order': {
      const keys = Array.isArray(data.items) ? (data.items as Data[]).map((item) => item.key) : [];
      return new Set(keys).size === keys.length ? [] : [{ path: 'data.items', message: 'item keys repeat' }];
    }
    case 'daily-settings':
      return (data.game === 'careerPath') === (data.seconds === null)
        ? []
        : [{ path: 'data.seconds', message: 'Football Logic and Put in Order have seconds; Career Path has none' }];
    default:
      return [];
  }
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
