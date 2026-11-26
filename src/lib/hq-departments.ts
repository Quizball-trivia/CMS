// QuizBall's departments. Each one has its own space in HQ (where its agents
// work and its numbers are) and the CMS tools that belong to it. The sidebar
// shows one group per department; the HQ home shows one row per department.

import {
  Activity,
  BarChart3,
  Bot,
  CalendarDays,
  ChartColumn,
  Egg,
  FileQuestion,
  FileSearch,
  FolderKanban,
  Gamepad,
  Gavel,
  Globe2,
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
import { ACTIVITY_ALLOWED_EMAIL } from '@/lib/constants';
import type { HqDepartmentKey } from '@/types';

export interface HqDepartmentTool {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
  /** Active only on this exact path (for a tool whose href is a prefix of a sibling's). */
  exact?: boolean;
  /**
   * Shows real production numbers: hidden unless "real data" is turned on in
   * Preferences, so a demo never wanders from the scaled /stats page into it.
   */
  realData?: boolean;
  /** Only these accounts may open the page (it redirects everyone else). */
  allowedEmails?: readonly string[];
}

export interface HqDepartmentInfo {
  key: HqDepartmentKey;
  name: string;
  emoji: string;
  mission: string;
  /** The department's own page in HQ, where its agents and numbers live. None yet for departments still to be built. */
  home?: string;
  tools: HqDepartmentTool[];
}

export const HQ_DEPARTMENTS: HqDepartmentInfo[] = [
  {
    key: 'content',
    name: 'Content',
    emoji: '✍️',
    mission: 'Keeps every game supplied with questions, puzzles and show packs that are right, fresh and well translated.',
    home: '/hq/content',
    tools: [
      { title: 'Content gaps', href: '/hq/content-gaps', icon: FileSearch, description: 'Answers players typed that the game could not judge.' },
      { title: 'Questions', href: '/questions', icon: FileQuestion, description: 'The question bank: write, edit, review.' },
      { title: 'Categories', href: '/categories', icon: FolderKanban, description: 'Topics, and what is featured on the home screen.' },
      { title: 'Quiz pages', href: '/quiz-pages', icon: PanelsTopLeft, description: 'Landing pages for themed quizzes.' },
      { title: 'Question pipeline', href: '/agents', icon: Bot, description: 'AI question generation, review queue and spend.' },
    ],
  },
  {
    key: 'games',
    name: 'Games',
    emoji: '🎮',
    mission: 'Makes every game better all the time: how it plays, how hard it is, and what gets built next.',
    home: '/hq/games',
    tools: [
      { title: 'Bot tuning', href: '/bot-tuning', icon: SlidersHorizontal, description: 'How hard the bots play, per mode and level.' },
      { title: 'Daily challenges', href: '/daily-challenges', icon: CalendarDays, description: 'The daily challenge calendar.' },
      { title: 'Auction cards', href: '/auction', icon: Gavel, description: 'Player cards for the auction game.' },
    ],
  },
  {
    key: 'competitions',
    name: 'Competitions',
    emoji: '🏆',
    mission: 'Runs the live events and leagues that give players a reason to come back at a set time.',
    tools: [
      { title: 'Weekend League', href: '/weekend-league', icon: Trophy, description: 'Schedule and results of the weekend league.', exact: true },
      { title: 'WL content', href: '/weekend-league/content', icon: Upload, description: 'Question sets for upcoming league weekends.' },
    ],
  },
  {
    key: 'growth',
    name: 'Growth',
    emoji: '📈',
    mission: 'Brings new players in, keeps them coming back, and listens to what they say.',
    tools: [
      { title: 'Dashboard', href: '/stats', icon: BarChart3, description: 'Headline numbers — demo-safe preview.' },
      { title: 'Analytics (live)', href: '/analytics', icon: ChartColumn, description: 'Real players, matches and trends.', realData: true },
      { title: 'Audience', href: '/audience', icon: Globe2, description: 'Who plays, where they come from, which games.', realData: true },
      { title: 'Persons', href: '/persons', icon: UserSearch, description: 'Real player journeys, one person at a time.', realData: true },
      // The page itself redirects anyone but ACTIVITY_ALLOWED_EMAIL, so only list it for them.
      { title: 'Player activity', href: '/activity', icon: Activity, description: 'Who played what, and when.', allowedEmails: [ACTIVITY_ALLOWED_EMAIL] },
      { title: 'Retention', href: '/retention', icon: Mail, description: 'Win-back emails and returning players.' },
      { title: 'Users', href: '/users', icon: Users, description: 'Look up and manage player accounts.' },
      { title: 'Announcements', href: '/announcements', icon: Megaphone, description: 'In-app news and banners for players.' },
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

/** Drops real-data tools unless real data is switched on (Preferences → useRealAnalyticsVisible). */
export function withoutHiddenRealData<T extends Pick<HqDepartmentTool, 'realData'>>(tools: T[], showRealData: boolean): T[] {
  return showRealData ? tools : tools.filter((t) => !t.realData);
}

/** Whether this signed-in account may see a tool (most tools: everyone with access to the section). */
export function canSeeTool(tool: Pick<HqDepartmentTool, 'allowedEmails'>, email: string | null | undefined): boolean {
  return !tool.allowedEmails || (!!email && tool.allowedEmails.includes(email));
}

/** A department's tools this account may see. */
export function toolsForUser(dept: Pick<HqDepartmentInfo, 'tools'>, email: string | null | undefined): HqDepartmentTool[] {
  return dept.tools.filter((t) => canSeeTool(t, email));
}

/** Icon for the Partners group header in the collapsed sidebar rail. */
export const PARTNERS_ICON = Egg;
