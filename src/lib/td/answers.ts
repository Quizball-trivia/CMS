import type { TdContentType } from './admin-api';

/** The types whose rounds accept only the accepted spellings, not the shown answer (game-core: rounds/cards, box, buzzer). */
const SPELLINGS_ONLY = new Set<TdContentType>(['cards', 'whoami-subjects', 'box-questions', 'penalty-questions']);

const plain = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** The data with its shown answer among its accepted spellings (first), as the
 *  game needs: in Rounds I–III and penalties a guess is compared with the
 *  spellings only, so a shown answer left out of them would not count. */
export function withShownAnswer<T>(type: TdContentType, data: T): T {
  if (!SPELLINGS_ONLY.has(type)) return data;
  const record = data as Record<string, unknown>;
  const display = typeof record.display === 'string' ? record.display.trim() : '';
  const aliases = Array.isArray(record.aliases) ? (record.aliases as string[]) : [];
  if (!display || aliases.some((alias) => plain(alias) === plain(display))) return data;
  return { ...record, aliases: [display, ...aliases] } as T;
}
