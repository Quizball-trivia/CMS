/**
 * Spreadsheets to import items. A sheet (CSV or TSV, or cells pasted from a
 * spreadsheet) holds one content type: a header row naming the columns below,
 * then one row per item, in order (an item may refer to one above it or to
 * content that exists). A JSON file of ContentImportItems may mix types.
 *
 * Cells: lists are split on `|` (write `\|` for a literal bar) or given as a
 * JSON array; an empty cell is null where the field may be empty; numbers
 * and yes/no are read strictly. Nested fields have their own columns or a
 * short form (see TD_IMPORT_COLUMNS).
 */
import type { TdContentType } from './admin-api';

export const TD_IMPORT_MAX_ITEMS = 2000;
/** The API's import body limit is 4 MiB; leave room for the envelope. */
export const TD_IMPORT_MAX_BYTES = 4 * 1024 * 1024 - 16 * 1024;

type Kind = 'text' | 'optional' | 'list' | 'number' | 'optionalNumber' | 'boolean';

export interface TdImportColumn {
  name: string;
  kind: Kind | 'custom';
  required: boolean;
  help: string;
  example: string;
}

const col = (name: string, kind: Kind | 'custom', help: string, example: string, required = kind !== 'optional' && kind !== 'optionalNumber'): TdImportColumn => ({ name, kind, required, help, example });

const KEY = col('key', 'text', 'The row’s key: lower-case letters, digits, - and _', 'messi');
const ALIASES = (name = 'aliases') => col(name, 'list', 'Accepted spellings, separated by |', 'messi|lionel messi');
const POSITION = col('position', 'optionalNumber', 'Order in a release (optional)', '');
const NOTE = col('note', 'optional', 'A note for the team (optional)', '');

export const TD_IMPORT_COLUMNS: Record<TdContentType, TdImportColumn[]> = {
  'card-categories': [KEY, col('prompt', 'text', 'The category’s prompt', 'Legends of the game')],
  cards: [
    col('categoryKey', 'text', 'The card category’s key', 'legends'),
    KEY,
    col('value', 'number', '1, 2 or 3', '2'),
    col('display', 'text', 'The answer as shown', 'Lionel Messi'),
    ALIASES(),
    col('lines', 'list', 'Clue lines, separated by | (up to 8)', 'Argentina|Barcelona'),
    col('photoId', 'optionalNumber', 'SoFIFA player id (optional)', ''),
    col('photoVer', 'optional', 'SoFIFA version, with photoId', ''),
    col('imageKey', 'optional', 'An uploaded photo’s image key (optional)', ''),
  ],
  'whoami-subjects': [KEY, col('display', 'text', 'The answer as shown', 'Kakha Kaladze'), ALIASES(), col('clues', 'list', 'Clues in reading order, separated by |', 'A defender|Milan|Two Champions Leagues')],
  'box-categories': [KEY, col('title', 'text', 'The category’s title', 'World Cups')],
  'box-questions': [col('categoryKey', 'text', 'The box category’s key', 'world-cups'), KEY, col('q', 'text', 'The question', 'Who won in 2022?'), col('display', 'text', 'The answer as shown', 'Argentina'), ALIASES()],
  'penalty-questions': [KEY, col('q', 'text', 'The question', 'Capital of Georgia?'), col('display', 'text', 'The answer as shown', 'Tbilisi'), ALIASES()],
  'practice-questions': [
    KEY,
    col('difficulty', 'text', 'easy, medium or hard', 'easy'),
    col('category', 'text', 'The category label', 'Clubs'),
    col('prompt', 'text', 'The question', 'Which club plays at Anfield?'),
    col('options', 'list', 'The options, separated by | (2 to 8)', 'Liverpool|Everton|Chelsea'),
    col('answer', 'number', 'The right option’s number, counting from 1', '1'),
    col('explanation', 'optional', 'Shown after answering (optional)', ''),
    col('imageKey', 'optional', 'An image key (optional)', ''),
  ],
  media: [],
  clubs: [
    KEY,
    col('label', 'text', 'The name as shown', 'Dinamo Tbilisi'),
    col('value', 'text', 'What a pick stores', 'Dinamo Tbilisi'),
    col('country', 'text', 'Country', 'Georgia'),
    col('countryKa', 'optional', 'Country in Georgian (optional)', 'საქართველო'),
    col('flag', 'optional', 'Flag emoji (optional)', '🇬🇪'),
    col('crest', 'text', 'Crest file under /assets/clubs', 'dinamo-tbilisi.webp'),
    col('crestImageKey', 'optional', 'An uploaded crest’s image key (optional)', ''),
    col('hidden', 'boolean', 'yes to hide from the club picker', 'no'),
  ],
  'football-logic': [
    KEY,
    col('puzzle', 'text', 'The puzzle (set) key', 'fl-3'),
    col('category', 'text', 'Category', 'Clubs'),
    col('prompt', 'custom', 'Prompt (may be empty)', 'What links these?', false),
    col('imageA', 'optional', 'Image A: /path or https:// URL (optional)', ''),
    col('imageB', 'optional', 'Image B (optional)', ''),
    col('displayAnswer', 'text', 'The answer as shown', 'Napoli'),
    ALIASES('acceptedAnswers'),
  ],
  'put-in-order': [
    KEY,
    col('puzzle', 'text', 'The puzzle (set) key', 'pio-3'),
    col('prompt', 'text', 'The prompt', 'Earliest to latest'),
    col('items', 'custom', 'Items in the order shown: label=sortValue, separated by | (or a JSON array of {key,label,sortValue})', 'Italy=2006|Spain=2010|Germany=2014'),
  ],
  'career-path': [
    KEY,
    col('puzzle', 'text', 'The puzzle (set) key', 'cp-3'),
    col('prompt', 'text', 'The prompt', 'Whose career is this?'),
    col('displayAnswer', 'text', 'The answer as shown', 'Khvicha Kvaratskhelia'),
    ALIASES('acceptedAnswers'),
    col('clubs', 'custom', 'The career in order: Name or Name=clubKey, separated by |', 'Dinamo Tbilisi=dinamo-tbilisi|Rubin Kazan|Napoli=napoli'),
  ],
  'daily-schedule': [col('game', 'text', 'footballLogic, putInOrder or careerPath', 'footballLogic'), col('date', 'text', 'The Georgia date (YYYY-MM-DD)', '2026-11-01'), col('puzzle', 'text', 'The puzzle key', 'fl-3')],
  'daily-settings': [],
};

/** Types a sheet can carry (images are uploaded; settings are one per game). */
export const TD_IMPORTABLE_TYPES = (Object.keys(TD_IMPORT_COLUMNS) as TdContentType[]).filter((type) => TD_IMPORT_COLUMNS[type].length > 0);

/* ── CSV / TSV ──────────────────────────────────────────────────────── */

/** RFC 4180 fields and records (quotes, doubled quotes, line breaks inside quotes); the delimiter is taken from the header line. */
/**
 * RFC 4180 records, blank ones dropped. `lines` gives each kept record's first physical line (1-based), counting
 * the line breaks inside quoted cells and the blank records, so a problem points at the line a spreadsheet shows.
 */
export function parseDelimited(text: string): { rows: string[][]; lines: number[]; delimiter: string } {
  const source = text.replace(/^\uFEFF/, '');
  const header = source.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = ['\t', ';', ','].reduce((best, d) => (header.split(d).length > header.split(best).length ? d : best), ',');
  const records: { cells: string[]; line: number }[] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let physical = 1;
  let start = 1;
  const end = () => {
    row.push(field);
    records.push({ cells: row, line: start });
    row = [];
    field = '';
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else {
        field += c;
        if (c === '\n' || (c === '\r' && source[i + 1] !== '\n')) physical++;
      }
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      end();
      physical++;
      start = physical;
    } else field += c;
  }
  if (field !== '' || row.length) end();
  const kept = records.filter((r) => r.cells.some((cell) => cell.trim() !== ''));
  return { rows: kept.map((r) => r.cells), lines: kept.map((r) => r.line), delimiter };
}

/* ── cells ─────────────────────────────────────────────────────────── */

export interface TdParseProblem {
  /** 1-based line of the sheet (the header is line 1); 0 for the whole file. */
  line: number;
  column: string | null;
  message: string;
}

class CellError extends Error {}

function list(cell: string): string[] {
  const trimmed = cell.trim();
  if (trimmed === '') return [];
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) throw new CellError('not a JSON array');
    return parsed.map(String);
  }
  return trimmed
    .split(/(?<!\\)\|/)
    .map((part) => part.replace(/\\\|/g, '|').trim())
    .filter((part) => part !== '');
}

function number(cell: string): number {
  const trimmed = cell.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) throw new CellError(`“${cell}” is not a number`);
  return Number(trimmed);
}

function yesNo(cell: string): boolean {
  const value = cell.trim().toLowerCase();
  if (['', 'no', 'false', '0', 'n'].includes(value)) return false;
  if (['yes', 'true', '1', 'y'].includes(value)) return true;
  throw new CellError(`“${cell}” is not yes or no`);
}

function items(cell: string) {
  const trimmed = cell.trim();
  if (trimmed.startsWith('[')) return JSON.parse(trimmed) as unknown;
  return list(cell).map((part, i) => {
    const at = part.lastIndexOf('=');
    if (at < 0) throw new CellError(`“${part}” needs =sortValue`);
    return { key: `item-${i + 1}`, label: part.slice(0, at).trim(), sortValue: number(part.slice(at + 1)) };
  });
}

function careerClubs(cell: string) {
  const trimmed = cell.trim();
  if (trimmed.startsWith('[')) return JSON.parse(trimmed) as unknown;
  return list(cell).map((part) => {
    const at = part.lastIndexOf('=');
    return at < 0 ? { name: part, clubKey: null } : { name: part.slice(0, at).trim(), clubKey: part.slice(at + 1).trim() || null };
  });
}

function read(column: TdImportColumn, cell: string): unknown {
  switch (column.kind) {
    case 'text':
      return cell.trim();
    case 'optional':
      return cell.trim() === '' ? null : cell.trim();
    case 'list':
      return list(cell);
    case 'number':
      return number(cell);
    case 'optionalNumber':
      return cell.trim() === '' ? null : number(cell);
    case 'boolean':
      return yesNo(cell);
    case 'custom':
      if (column.name === 'items') return items(cell);
      if (column.name === 'clubs') return careerClubs(cell);
      return cell.trim();
  }
}

/** One item from a sheet row, in the contract's data shape. */
function toItem(type: TdContentType, values: Record<string, unknown>) {
  const { position, note, ...data } = values;
  if (type === 'cards') {
    const { photoId, photoVer } = data;
    delete data.photoId;
    delete data.photoVer;
    data.photo = photoId === null || photoId === undefined ? null : { id: photoId, ver: photoVer ?? '' };
  }
  if (type === 'practice-questions' && typeof data.answer === 'number') data.answer -= 1;
  return {
    type,
    data,
    ...(position === null || position === undefined ? {} : { position }),
    ...(note === null || note === undefined || note === '' ? {} : { note }),
  };
}

export interface TdParsedImport {
  items: unknown[];
  /** The sheet line each item came from (1-based), for the report. */
  lines: number[];
  problems: TdParseProblem[];
}

export function parseSheet(type: TdContentType, text: string): TdParsedImport {
  const columns = [...TD_IMPORT_COLUMNS[type], POSITION, NOTE];
  const { rows, lines: at } = parseDelimited(text);
  const problems: TdParseProblem[] = [];
  if (rows.length < 2) return { items: [], lines: [], problems: [{ line: 0, column: null, message: 'The sheet needs a header row and at least one item.' }] };
  const header = rows[0].map((cell) => cell.trim());
  const index = new Map(header.map((name, i) => [name.toLowerCase(), i]));
  for (const name of header) if (name && !columns.some((c) => c.name.toLowerCase() === name.toLowerCase())) problems.push({ line: at[0], column: name, message: `“${name}” is not a column of this type` });
  for (const column of columns) if (column.required && !index.has(column.name.toLowerCase())) problems.push({ line: at[0], column: column.name, message: `The column “${column.name}” is missing` });
  if (problems.length) return { items: [], lines: [], problems };
  const items: unknown[] = [];
  const lines: number[] = [];
  rows.slice(1).forEach((cells, i) => {
    const line = at[i + 1];
    const values: Record<string, unknown> = {};
    let ok = true;
    for (const column of columns) {
      const at = index.get(column.name.toLowerCase());
      if (at === undefined) {
        if (column.kind === 'custom' && column.name === 'prompt') values.prompt = '';
        else if (!column.required) values[column.name] = column.kind === 'boolean' ? false : null;
        continue;
      }
      try {
        values[column.name] = read(column, cells[at] ?? '');
      } catch (error) {
        ok = false;
        problems.push({ line, column: column.name, message: error instanceof CellError ? error.message : 'not valid JSON' });
      }
    }
    if (ok) {
      items.push(toItem(type, values));
      lines.push(line);
    }
  });
  return { items, lines, problems: [...problems, ...limits(items)] };
}

/** A JSON file: an array of items, or { items: [...] }. */
export function parseItemsJson(text: string): TdParsedImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { items: [], lines: [], problems: [{ line: 0, column: null, message: 'The file is not valid JSON.' }] };
  }
  const items = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown }).items) ? (parsed as { items: unknown[] }).items : null;
  if (!items) return { items: [], lines: [], problems: [{ line: 0, column: null, message: 'Expected a list of items, or { "items": [...] }.' }] };
  return { items, lines: items.map((_, i) => i + 1), problems: limits(items) };
}

function limits(items: unknown[]): TdParseProblem[] {
  if (items.length > TD_IMPORT_MAX_ITEMS) return [{ line: 0, column: null, message: `At most ${TD_IMPORT_MAX_ITEMS} items per import; this has ${items.length}. Split the file.` }];
  if (new TextEncoder().encode(JSON.stringify({ items })).length > TD_IMPORT_MAX_BYTES) return [{ line: 0, column: null, message: 'The import is larger than the API accepts (4 MB). Split the file.' }];
  return [];
}

/** A CSV template for a type: the header and one example row. */
export function sheetTemplate(type: TdContentType): string {
  const columns = TD_IMPORT_COLUMNS[type];
  const quote = (cell: string) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  return `${columns.map((c) => c.name).join(',')}\r\n${columns.map((c) => quote(c.example)).join(',')}\r\n`;
}
