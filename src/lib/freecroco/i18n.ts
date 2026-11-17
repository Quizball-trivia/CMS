/**
 * The Freecroco section's language. Freecroco's staff read Georgian; Quizball admins see the same pages in English.
 * The language follows who is signed in, so one build serves both.
 *
 * Text is written in English where it is used and looked up by that English: `t('Save')`. Whole sentences only,
 * with `{name}` for what varies, so the Georgian can order its words as it needs.
 */
'use client';

import { useContext } from 'react';
import type { ReactNode } from 'react';
import { AuthContext } from '@/providers/auth-provider';
import { cmsRole } from './access';
import { FC_KA } from './i18n-ka';
import type { PartnerGameId } from '@/types/freecroco';

export type FcLang = 'ka' | 'en';
type Vars = Record<string, string | number>;

export function fcLangForRole(role: string | null | undefined): FcLang {
  return cmsRole(role) === 'partner_staff' ? 'ka' : 'en';
}

const fill = (text: string, vars?: Vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (mark, name: string) => (name in vars ? String(vars[name]) : mark)) : text;

export interface FcText {
  lang: FcLang;
  t: (source: string, vars?: Vars) => string;
  /** A counted phrase: English picks one/other; Georgian keeps one form, filed under `other`. */
  tn: (count: number, one: string, other: string, vars?: Vars) => string;
  /** A sentence with elements inside it: `{name}` marks where each goes. */
  tr: (source: string, parts: Record<string, ReactNode>) => ReactNode[];
  game: (gameId: PartnerGameId) => string;
}

export function fcText(lang: FcLang): FcText {
  const lookup = (source: string) => (lang === 'ka' ? (FC_KA[source] ?? source) : source);
  const t = (source: string, vars?: Vars) => fill(lookup(source), vars);
  return {
    lang,
    t,
    tn: (count, one, other, vars) => fill(lang === 'ka' ? lookup(other) : count === 1 ? one : other, { count, ...vars }),
    tr: (source, parts) =>
      lookup(source)
        .split(/(\{\w+\})/)
        .filter((piece) => piece !== '')
        .map((piece) => {
          const name = /^\{(\w+)\}$/.exec(piece)?.[1];
          return name !== undefined && name in parts ? parts[name] : piece;
        }),
    game: (gameId) => t(GAME_NAMES[gameId]),
  };
}

const GAME_NAMES: Record<PartnerGameId, string> = {
  ranked: 'Ranked',
  'guess-the-goal': 'Guess the Goal',
  'true-false': 'True / False',
  countdown: 'Countdown',
  'pick-em': "Pick 'em",
  'career-path': 'Career Path',
  'higher-lower': 'Higher / Lower',
  'card-detective': 'Card Detective',
  'road-to-goal': 'Road to Goal',
  'trivia-mines': 'Trivia Mines',
  'quiz-board': 'Quiz Board',
  'fake-fact': 'Fake Fact',
};

/** English outside the dashboard (tests render pages without signing in). */
export function useFcText(): FcText {
  const auth = useContext(AuthContext);
  return fcText(fcLangForRole(auth?.user?.role));
}
