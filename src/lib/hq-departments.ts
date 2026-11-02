// QuizBall HQ departments: a fixed list shared with the backend
// (hq.members.department CHECK constraint). Each department groups the
// people + agents that own an area and the existing CMS tools for it.

import {
  Activity,
  BarChart3,
  Bot,
  CalendarDays,
  ChartColumn,
  Egg,
  FileQuestion,
  FolderKanban,
  Gamepad,
  Gavel,
  Mail,
  Megaphone,
  PanelsTopLeft,
  Send,
  SlidersHorizontal,
  Trophy,
  Upload,
  UserCog,
  UserSearch,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { FREECROCO_ROOT, FREECROCO_STAFF } from '@/lib/freecroco/access';
import type { HqDepartmentKey } from '@/types';

export interface HqDepartmentTool {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
  /** Active only on this exact path (for a tool whose href is a prefix of a sibling's). */
  exact?: boolean;
}

export interface HqDepartmentInfo {
  key: HqDepartmentKey;
  name: string;
  emoji: string;
  mission: string;
  tools: HqDepartmentTool[];
}

export const HQ_DEPARTMENTS: HqDepartmentInfo[] = [
  {
    key: 'leadership',
    name: 'Leadership',
    emoji: '🧭',
    mission: 'Sets direction, makes the calls, and keeps everyone pointed at the same goals.',
    tools: [],
  },
  {
    key: 'growth',
    name: 'Growth',
    emoji: '📈',
    mission: 'Brings new players in, keeps them coming back, and listens to what they say.',
    tools: [
      { title: 'Analytics', href: '/stats', icon: BarChart3, description: 'Players, matches and revenue trends.' },
      { title: 'Player activity', href: '/activity', icon: Activity, description: 'Who played what, and when.' },
      { title: 'Retention', href: '/retention', icon: Mail, description: 'Win-back emails and returning players.' },
      { title: 'Users', href: '/users', icon: Users, description: 'Look up and manage player accounts.' },
      { title: 'Announcements', href: '/announcements', icon: Megaphone, description: 'In-app news and banners for players.' },
    ],
  },
  {
    key: 'content',
    name: 'Content',
    emoji: '✍️',
    mission: 'Writes, checks and organises every question and quiz players see.',
    tools: [
      { title: 'Questions', href: '/questions', icon: FileQuestion, description: 'The question bank: write, edit, review.' },
      { title: 'Categories', href: '/categories', icon: FolderKanban, description: 'Topics, and what is featured on the home screen.' },
      { title: 'Quiz pages', href: '/quiz-pages', icon: PanelsTopLeft, description: 'Landing pages for themed quizzes.' },
      { title: 'Question pipeline', href: '/agents', icon: Bot, description: 'AI question generation, review queue and spend.' },
    ],
  },
  {
    key: 'competitions',
    name: 'Competitions',
    emoji: '🏆',
    mission: 'Runs the leagues, daily challenges and events that give players a reason to compete.',
    tools: [
      { title: 'Weekend League', href: '/weekend-league', icon: Trophy, description: 'Schedule and results of the weekend league.', exact: true },
      { title: 'WL content', href: '/weekend-league/content', icon: Upload, description: 'Question sets for upcoming league weekends.' },
      { title: 'Daily challenges', href: '/daily-challenges', icon: CalendarDays, description: 'The daily challenge calendar.' },
      { title: 'Auction cards', href: '/auction', icon: Gavel, description: 'Player cards for the auction game.' },
    ],
  },
  {
    key: 'engineering',
    name: 'Engineering',
    emoji: '🛠️',
    mission: 'Keeps the game fast, stable and bug-free, and tunes how the bots play.',
    tools: [
      { title: 'Bot tuning', href: '/bot-tuning', icon: SlidersHorizontal, description: 'How hard the bots play, per mode and level.' },
    ],
  },
  {
    key: 'partners',
    name: 'Partners',
    emoji: '🤝',
    mission: 'Looks after partner integrations like Freecroco: games, deliveries and their staff.',
    tools: [
      { title: 'Freecroco', href: FREECROCO_ROOT, icon: ChartColumn, description: 'Partner overview and key numbers.', exact: true },
      { title: 'Games', href: `${FREECROCO_ROOT}/games`, icon: Gamepad, description: 'Games running for the partner.' },
      { title: 'Calendar', href: `${FREECROCO_ROOT}/calendar`, icon: CalendarDays, description: 'What is scheduled, day by day.' },
      { title: 'Ranked points', href: `${FREECROCO_ROOT}/ranked-points`, icon: Trophy, description: 'Points sent to the partner per match.' },
      { title: 'Deliveries', href: `${FREECROCO_ROOT}/deliveries`, icon: Send, description: 'Score deliveries and resends.' },
      { title: 'Players', href: `${FREECROCO_ROOT}/players`, icon: UserSearch, description: 'Partner players and their results.' },
      { title: 'Staff', href: FREECROCO_STAFF, icon: UserCog, description: 'Who at the partner can sign in.' },
    ],
  },
];

export const HQ_DEPARTMENT_KEYS = HQ_DEPARTMENTS.map((d) => d.key);

/** Icon for the Partners group header in the collapsed sidebar rail. */
export const PARTNERS_ICON = Egg;

export function departmentInfo(key: string | null | undefined): HqDepartmentInfo | undefined {
  return HQ_DEPARTMENTS.find((d) => d.key === key);
}

export function departmentHref(key: HqDepartmentKey): string {
  return `/hq/departments/${key}`;
}

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/**
 * Which department owns the page at `pathname` (longest tool-route match).
 * HQ's own pages and unknown pages belong to none.
 */
export function departmentForPath(pathname: string): HqDepartmentInfo | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (matchesRoute(path, '/hq')) return null;
  let best: { dept: HqDepartmentInfo; len: number } | null = null;
  for (const dept of HQ_DEPARTMENTS) {
    for (const tool of dept.tools) {
      if (matchesRoute(path, tool.href) && (!best || tool.href.length > best.len)) {
        best = { dept, len: tool.href.length };
      }
    }
  }
  return best?.dept ?? null;
}
