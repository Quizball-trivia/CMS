// QuizBall's departments. Each one has its own page in HQ (its agents, its
// numbers, what it needs from a person) and the CMS tools that belong to it.
// The sidebar shows one group per department; the HQ home shows one card each.

import {
  Activity,
  Bot,
  CalendarDays,
  ChartColumn,
  Egg,
  FileQuestion,
  FileSearch,
  FolderKanban,
  Gamepad,
  Gamepad2,
  Gavel,
  Globe2,
  Handshake,
  Landmark,
  Mail,
  Megaphone,
  MonitorPlay,
  PanelsTopLeft,
  PenLine,
  Presentation,
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
  /** Only these accounts may open the page (it redirects everyone else). */
  allowedEmails?: readonly string[];
}

export interface HqDepartmentInfo {
  key: HqDepartmentKey;
  name: string;
  /** One line: what the department is for. */
  mission: string;
  /** The department's own page in HQ. */
  home: string;
  /** The person the department answers to, when one is named. */
  lead?: string;
  tools: HqDepartmentTool[];
}

export const HQ_DEPARTMENTS: HqDepartmentInfo[] = [
  {
    key: 'content',
    name: 'Content',
    mission: 'Keeps every game supplied with questions, puzzles and show packs that are right, fresh and well translated.',
    home: '/hq/content',
    lead: 'Tato',
    tools: [
      { title: 'Content gaps', href: '/hq/content-gaps', icon: FileSearch, description: 'Answers players typed that the game could not judge.' },
      { title: 'Questions', href: '/questions', icon: FileQuestion, description: 'The question bank: write, edit, review.' },
      { title: 'Categories', href: '/categories', icon: FolderKanban, description: 'Topics, and what is featured on the home screen.' },
      { title: 'Quiz pages', href: '/quiz-pages', icon: PanelsTopLeft, description: 'Landing pages for themed quizzes.' },
      { title: 'Daily games pipeline', href: '/agents', icon: Bot, description: 'The earlier question pipeline. It still fills the daily challenges every night.' },
    ],
  },
  {
    key: 'games',
    name: 'Games',
    mission: 'Makes every game better all the time: how it plays, how hard it is, and what gets built next.',
    home: '/hq/games',
    lead: 'Nika E.',
    tools: [
      { title: 'Bot tuning', href: '/bot-tuning', icon: SlidersHorizontal, description: 'How hard the bots play, per mode and level.' },
      { title: 'Daily challenges', href: '/daily-challenges', icon: CalendarDays, description: 'The daily challenge calendar.' },
      { title: 'Auction cards', href: '/auction', icon: Gavel, description: 'Player cards for the auction game.' },
    ],
  },
  {
    key: 'competitions',
    name: 'Competitions',
    mission: 'Runs the live shows and leagues that give players a reason to come back at a set time.',
    home: '/hq/competitions',
    tools: [
      { title: 'Monday show pack', href: '/hq/content?tab=show', icon: MonitorPlay, description: 'The questions for the next Monday live show.' },
      { title: 'Weekend League', href: '/weekend-league', icon: Trophy, description: 'Schedule and results of the weekend league.', exact: true },
      { title: 'League content', href: '/weekend-league/content', icon: Upload, description: 'Question sets for upcoming league weekends.' },
    ],
  },
  {
    key: 'marketing',
    name: 'Marketing',
    mission: 'Brings new players in, brings old ones back, and tells the world what QuizBall is.',
    home: '/hq/marketing',
    tools: [
      { title: 'Win-back emails', href: '/retention', icon: Mail, description: 'Emails to players who stopped playing, and who came back.' },
      { title: 'Announcements', href: '/announcements', icon: Megaphone, description: 'In-app news and banners for players.' },
      { title: 'Players', href: '/users', icon: Users, description: 'Look up and manage player accounts.' },
      { title: 'Demo dashboard', href: '/stats', icon: Presentation, description: 'Scaled-up numbers for showing outside the team. Not real figures.' },
    ],
  },
  {
    key: 'partners',
    name: 'Partners',
    mission: 'Looks after companies that run QuizBall for their own players, and finds the next ones.',
    home: '/hq/partners',
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
  {
    key: 'investors',
    name: 'Investors',
    mission: 'Gets QuizBall ready to raise money: who to talk to, what to show them, and keeping them informed.',
    home: '/hq/investors',
    tools: [],
  },
];

/** Pages about players and numbers that belong to the whole company, listed under Analytics. */
export const HQ_ANALYTICS_TOOLS: HqDepartmentTool[] = [
  { title: 'Audience', href: '/audience', icon: Globe2, description: 'Who plays, where they come from, which games.' },
  { title: 'Player journeys', href: '/persons', icon: UserSearch, description: 'What one real player did, step by step.' },
  // The page itself redirects anyone but ACTIVITY_ALLOWED_EMAIL, so only list it for them.
  { title: 'Player activity', href: '/activity', icon: Activity, description: 'Who played what, and when.', allowedEmails: [ACTIVITY_ALLOWED_EMAIL] },
];

/** Each department's icon and colours, the same in the sidebar, on the HQ home and on its own page. */
export const DEPARTMENT_LOOK: Record<HqDepartmentKey, { icon: LucideIcon; /** Icon tile on a light surface. */ tint: string; /** Icon on a light surface. */ text: string; /** Icon on the dark sidebar. */ onInk: string; /** The glow of its hero, and its accent bars. */ hex: string }> = {
  content: { icon: PenLine, tint: 'bg-violet-50 text-violet-700', text: 'text-violet-700', onInk: 'text-violet-400', hex: '#8b5cf6' },
  games: { icon: Gamepad2, tint: 'bg-blue-50 text-blue-700', text: 'text-blue-700', onInk: 'text-blue-400', hex: '#3b82f6' },
  competitions: { icon: Trophy, tint: 'bg-amber-50 text-amber-700', text: 'text-amber-700', onInk: 'text-amber-400', hex: '#f59e0b' },
  marketing: { icon: Megaphone, tint: 'bg-pink-50 text-pink-700', text: 'text-pink-700', onInk: 'text-pink-400', hex: '#ec4899' },
  partners: { icon: Handshake, tint: 'bg-cyan-50 text-cyan-700', text: 'text-cyan-700', onInk: 'text-cyan-400', hex: '#06b6d4' },
  investors: { icon: Landmark, tint: 'bg-emerald-50 text-emerald-700', text: 'text-emerald-700', onInk: 'text-emerald-400', hex: '#10b981' },
};

export const HQ_DEPARTMENT_KEYS = HQ_DEPARTMENTS.map((d) => d.key);

export function departmentByKey(key: string): HqDepartmentInfo | undefined {
  return HQ_DEPARTMENTS.find((d) => d.key === key);
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
