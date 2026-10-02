import type { ComponentType } from 'react';
import type { TdContentData, TdContentType } from '@/lib/td/admin-api';
import { georgiaToday } from '@/lib/td/georgia';
import { t } from '@/lib/td/i18n';
import { CareerPathEditor, DailyScheduleEditor, DailySettingsEditor, FootballLogicEditor, PutInOrderEditor } from './editors/dailies';
import { ClubEditor, MediaEditor, PracticeEditor } from './editors/library';
import { BoxCategoryEditor, BoxQuestionEditor, CardCategoryEditor, CardEditor, PenaltyEditor, WhoamiEditor, type TdEditorProps } from './editors/rounds';

export interface TdTypeConfig<T extends TdContentType> {
  singular: string;
  plural: string;
  /** How a row is named in lists and the editor. */
  title(data: TdContentData<T>): string;
  empty(preset?: Partial<TdContentData<T>>): TdContentData<T>;
  Editor: ComponentType<TdEditorProps<T>>;
}

/** A starting key for a new row; editable until the first save. */
export const newKey = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

export const TD_TYPE_CONFIG: { [T in TdContentType]: TdTypeConfig<T> } = {
  'card-categories': {
    singular: t('card category'),
    plural: t('card categories'),
    title: (d) => d.prompt,
    empty: (p) => ({ key: newKey('cat'), prompt: '', ...p }),
    Editor: CardCategoryEditor,
  },
  cards: {
    singular: t('card'),
    plural: t('cards'),
    title: (d) => d.display,
    empty: (p) => ({ categoryKey: '', key: newKey('card'), value: 1, lines: [], display: '', aliases: [], photo: null, imageKey: null, ...p }),
    Editor: CardEditor,
  },
  'whoami-subjects': {
    singular: t('subject'),
    plural: t('subjects'),
    title: (d) => d.display,
    empty: (p) => ({ key: newKey('who'), display: '', aliases: [], clues: [''], ...p }),
    Editor: WhoamiEditor,
  },
  'box-categories': {
    singular: t('box category'),
    plural: t('box categories'),
    title: (d) => d.title,
    empty: (p) => ({ key: newKey('box'), title: '', ...p }),
    Editor: BoxCategoryEditor,
  },
  'box-questions': {
    singular: t('question'),
    plural: t('questions'),
    title: (d) => d.q,
    empty: (p) => ({ categoryKey: '', key: newKey('q'), q: '', display: '', aliases: [], ...p }),
    Editor: BoxQuestionEditor,
  },
  'penalty-questions': {
    singular: t('penalty question'),
    plural: t('penalty questions'),
    title: (d) => d.q,
    empty: (p) => ({ key: newKey('pen'), q: '', display: '', aliases: [], ...p }),
    Editor: PenaltyEditor,
  },
  'practice-questions': {
    singular: t('practice question'),
    plural: t('practice questions'),
    title: (d) => d.prompt,
    empty: (p) => ({ key: newKey('practice'), difficulty: 'easy', category: '', prompt: '', options: ['', ''], answer: 0, explanation: null, imageKey: null, ...p }),
    Editor: PracticeEditor,
  },
  media: {
    singular: t('image'),
    plural: t('images'),
    title: (d) => d.key,
    empty: (p) => ({ key: newKey('img'), url: null, uploadId: '', width: 1, height: 1, author: null, license: null, source: null, ...p }) as TdContentData<'media'>,
    Editor: MediaEditor,
  },
  clubs: {
    singular: t('club'),
    plural: t('clubs'),
    title: (d) => d.label,
    empty: (p) => ({ key: newKey('club'), label: '', value: '', country: '', countryKa: null, flag: null, crest: 'club.webp', crestImageKey: null, hidden: false, ...p }),
    Editor: ClubEditor,
  },
  'football-logic': {
    singular: t('Football Logic question'),
    plural: t('Football Logic questions'),
    title: (d) => d.displayAnswer,
    empty: (p) => ({ key: newKey('fl'), puzzle: '', category: '', prompt: '', imageA: null, imageB: null, displayAnswer: '', acceptedAnswers: [], ...p }),
    Editor: FootballLogicEditor,
  },
  'put-in-order': {
    singular: t('Put in Order round'),
    plural: t('Put in Order rounds'),
    title: (d) => d.prompt,
    empty: (p) => ({ key: newKey('pio'), puzzle: '', prompt: '', items: [{ key: 'item-1', label: '', sortValue: 1 }, { key: 'item-2', label: '', sortValue: 2 }], ...p }),
    Editor: PutInOrderEditor,
  },
  'career-path': {
    singular: t('Career Path question'),
    plural: t('Career Path questions'),
    title: (d) => d.displayAnswer,
    empty: (p) => ({ key: newKey('cp'), puzzle: '', prompt: t('Whose career is this?'), displayAnswer: '', acceptedAnswers: [], clubs: [{ name: '', clubKey: null }], ...p }),
    Editor: CareerPathEditor,
  },
  'daily-schedule': {
    singular: t('calendar date'),
    plural: t('calendar dates'),
    title: (d) => `${d.date} · ${d.puzzle}`,
    empty: (p) => ({ game: 'footballLogic', date: georgiaToday(), puzzle: '', ...p }),
    Editor: DailyScheduleEditor,
  },
  'daily-settings': {
    singular: t('daily settings'),
    plural: t('daily settings'),
    title: (d) => d.game,
    empty: (p) => ({ game: 'footballLogic', seconds: 30, cycle: null, ...p }),
    Editor: DailySettingsEditor,
  },
};
