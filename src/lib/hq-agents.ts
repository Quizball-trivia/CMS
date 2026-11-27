// Every agent HQ has or could have, by department. An agent that is running
// comes from the harness (its name, model and today's runs are live); the ones
// listed here that the harness does not know yet are suggestions: what the
// agent would do, what comes out of it, and what has to exist before it can start.

import type { HarnessAgent, HqDepartmentKey } from '@/types';

export interface SuggestedAgent {
  /** The slug it has (or will have) in the harness. Once the harness runs it, it stops being a suggestion. */
  slug: string;
  name: string;
  department: HqDepartmentKey;
  /** What it does, in one sentence. */
  does: string;
  /** What a person gets out of it. */
  gives: string;
  /** What has to exist first. Absent: it can start with what HQ already has. */
  needs?: string;
  /** What stays a person's decision. */
  person: string;
}

/** Running agents that were never a suggestion, by department. Agents listed nowhere work for Content. */
const DEPARTMENT_OF: Record<string, HqDepartmentKey> = {
  'game-planner': 'games',
};

export const SUGGESTED_AGENTS: SuggestedAgent[] = [
  // ── Content ──
  {
    slug: 'day-builder',
    name: 'Day Builder',
    department: 'content',
    does: 'Builds the next days of every daily game before its calendar runs out.',
    gives: 'No daily game ever shows an old day. The runway stays above two weeks by itself.',
    needs: 'Each daily game needs a "build the next days" command. Minesweeper has one; the others are built by hand today.',
    person: 'Nothing day to day. A person only changes what a game should be about.',
  },
  {
    slug: 'photo-finder',
    name: 'Photo Finder',
    department: 'content',
    does: 'Finds a photo we are allowed to use for each question or goal that needs one.',
    gives: 'What Minute? and photo questions stop waiting on a person to find pictures.',
    needs: 'A decision on where photos may come from (a paid photo library, or only free-to-use sources).',
    person: 'Sets which photo sources are allowed and the monthly budget.',
  },
  {
    slug: 'knowledge-keeper',
    name: 'Knowledge Keeper',
    department: 'content',
    does: 'Keeps the football knowledge base current: transfers, new players, retired ones, name spellings.',
    gives: 'Games that check typed answers stop rejecting correct ones, and questions stop going out of date.',
    needs: 'The two player lists joined into one (planned, not started).',
    person: 'Nothing day to day.',
  },

  // ── Games ──
  {
    slug: 'game-builder',
    name: 'Game Builder',
    department: 'games',
    does: 'Builds a planned change to a game and hands back a version you can play before anything is released.',
    gives: 'A change goes from a sentence to a playable preview without a developer.',
    needs: 'Two connections only an owner can make: a Claude subscription for the builder, and permission for HQ to open changes on GitHub.',
    person: 'Plays the preview and says yes or no. Nothing reaches players without that yes.',
  },
  {
    slug: 'game-scout',
    name: 'Game Scout',
    department: 'games',
    does: 'Reads how every game did this week and proposes the one change most likely to help each weak one.',
    gives: 'Suggestions arrive in Changes by themselves, each with the numbers behind it.',
    person: 'Picks which suggestions get planned.',
  },
  {
    slug: 'balance-tuner',
    name: 'Balance Tuner',
    department: 'games',
    does: 'Watches scores, finish rates and win rates, and proposes new rule numbers: lives, timers, points.',
    gives: 'Games that are too hard or too easy get corrected within days instead of months.',
    needs: 'Rule numbers moved into settings, so changing one does not need a release.',
    person: 'Sets how far a rule may move without asking.',
  },
  {
    slug: 'playtester',
    name: 'Playtester',
    department: 'games',
    does: 'Plays every preview like a new player would and reports what broke or confused it.',
    gives: 'A second pair of eyes on every change before a person spends time on it.',
    needs: 'The Game Builder first: there is nothing to playtest until previews exist.',
    person: 'Nothing day to day.',
  },

  // ── Competitions ──
  {
    slug: 'show-reporter',
    name: 'Show Reporter',
    department: 'competitions',
    does: 'After every Monday show, writes up who came, where players dropped out and which questions were too hard.',
    gives: 'A one-page report on Tuesday morning, and next week\'s pack tuned by it.',
    person: 'Reads it. Decides format changes.',
  },
  {
    slug: 'event-designer',
    name: 'Event Designer',
    department: 'competitions',
    does: 'Proposes new events (a cup weekend, a club night, a derby special) with rules, prize and expected turnout.',
    gives: 'A calendar of events to choose from instead of inventing each one from nothing.',
    person: 'Chooses which events run and sets the prize budget.',
  },
  {
    slug: 'league-runner',
    name: 'League Runner',
    department: 'competitions',
    does: 'Prepares each Weekend League weekend: the question sets, the schedule and the results post.',
    gives: 'The league runs every weekend without anyone preparing it.',
    needs: 'The Weekend League switched back on. It is paused by an owner decision.',
    person: 'Decides when the league returns.',
  },
  {
    slug: 'prize-clerk',
    name: 'Prize Clerk',
    department: 'competitions',
    does: 'Checks the winners of every event for cheating and prepares the list of who is owed what.',
    gives: 'A checked payout list after each event.',
    needs: 'A written rule for prizes and for what counts as cheating.',
    person: 'Approves every payout. An agent never sends money.',
  },

  // ── Marketing ──
  {
    slug: 'growth-analyst',
    name: 'Growth Analyst',
    department: 'marketing',
    does: 'Reads the week\'s numbers and writes what moved, the likely reason, and three things worth trying.',
    gives: 'A weekly page you can read in two minutes instead of studying charts.',
    person: 'Picks which ideas to try.',
  },
  {
    slug: 'social-writer',
    name: 'Social Writer',
    department: 'marketing',
    does: 'Drafts the week\'s posts from what is in the games: today\'s puzzle, the Monday show, a surprising stat.',
    gives: 'A week of ready posts in Georgian, Spanish and English, each with its picture brief.',
    needs: 'A short note on how QuizBall sounds, and which accounts we post on.',
    person: 'Approves posts, until you trust it to post alone.',
  },
  {
    slug: 'seo-writer',
    name: 'Search Page Writer',
    department: 'marketing',
    does: 'Finds football quiz searches we do not show up for and drafts a quiz page for each.',
    gives: 'New players from Google without paying for them.',
    needs: 'Access to Google Search Console for quizball.io.',
    person: 'Nothing day to day. Pages follow the same checks as questions.',
  },
  {
    slug: 'winback-writer',
    name: 'Win-back Writer',
    department: 'marketing',
    does: 'Tests subject lines and timing of the emails to players who stopped, and keeps the winners.',
    gives: 'More lapsed players returning from the same emails.',
    needs: 'A limit set by a person: how many emails one player may get in a month.',
    person: 'Sets the limits. The tests run inside them.',
  },
  {
    slug: 'ad-tester',
    name: 'Ad Tester',
    department: 'marketing',
    does: 'Runs small paid tests and measures what one new player costs on each channel.',
    gives: 'A clear answer on where a marketing lari brings the most players.',
    needs: 'Ad accounts (Meta, Google, TikTok) and a monthly budget.',
    person: 'Sets the budget and the cost per player we accept.',
  },
  {
    slug: 'community-listener',
    name: 'Community Listener',
    department: 'marketing',
    does: 'Reads what players write in feedback, reviews and comments, and groups it into what they ask for most.',
    gives: 'A weekly list of the top complaints and wishes, with real quotes.',
    person: 'Nothing day to day. Requests about a game go to Games as suggestions.',
  },

  // ── Partners ──
  {
    slug: 'partner-reporter',
    name: 'Partner Reporter',
    department: 'partners',
    does: 'Writes each partner a weekly report: players, games played, points sent, anything that failed.',
    gives: 'Partners hear from us every week without anyone compiling numbers.',
    person: 'Reads the first few before they go out by themselves.',
  },
  {
    slug: 'partner-scout',
    name: 'Partner Scout',
    department: 'partners',
    does: 'Finds companies that could run QuizBall for their own audience, the way Freecroco does, and says why it fits each.',
    gives: 'A list of who to call next, with a reason and a contact route for each.',
    person: 'Chooses who to approach. A person makes the contact.',
  },
  {
    slug: 'proposal-writer',
    name: 'Proposal Writer',
    department: 'partners',
    does: 'Turns a lead into a proposal written for that company: which games, what it costs, what they get.',
    gives: 'A proposal ready the same day a lead shows interest.',
    needs: 'Our price list for partners, written down once.',
    person: 'Edits and sends it. Agrees the price.',
  },
  {
    slug: 'delivery-watch',
    name: 'Delivery Watch',
    department: 'partners',
    does: 'Watches every score sent to a partner and raises the alarm when one fails or looks wrong.',
    gives: 'We learn about a broken delivery before the partner does.',
    person: 'Decides on resends that change a player\'s points.',
  },

  // ── Investors ──
  {
    slug: 'investor-scout',
    name: 'Investor Scout',
    department: 'investors',
    does: 'Finds funds and angels who back companies like ours at our stage, with the reason and a source for each.',
    gives: 'A researched list of who to talk to, instead of a cold start.',
    person: 'Chooses who to approach. A person makes the contact.',
  },
  {
    slug: 'investor-update-writer',
    name: 'Investor Update Writer',
    department: 'investors',
    does: 'Drafts the monthly update from our real numbers: what grew, what did not, what we need.',
    gives: 'An honest update ready to edit on the first of each month.',
    person: 'Edits and sends it.',
  },
  {
    slug: 'data-room-keeper',
    name: 'Data Room Keeper',
    department: 'investors',
    does: 'Keeps the numbers, the deck figures and the documents investors ask for up to date in one place.',
    gives: 'When an investor asks for the data room, it is already current.',
    needs: 'A place for the data room (a shared drive folder) and access to it.',
    person: 'Decides what may be shared with whom.',
  },
  {
    slug: 'pitch-coach',
    name: 'Pitch Coach',
    department: 'investors',
    does: 'Prepares the hard questions an investor will ask about our numbers, with honest answers.',
    gives: 'A question-and-answer sheet before every meeting, built on this week\'s figures.',
    person: 'Decides the story. The agent only makes sure the numbers back it.',
  },
  {
    slug: 'pipeline-keeper',
    name: 'Pipeline Keeper',
    department: 'investors',
    does: 'Tracks every investor conversation, what was promised and the next step, and drafts the follow-ups.',
    gives: 'No conversation goes cold because someone forgot to write back.',
    needs: 'One place where conversations are logged (a sheet is enough to start).',
    person: 'Sends every message. An agent never writes to an investor by itself.',
  },
];

/** The department an agent works for: where it was suggested, else where it is listed, else Content. */
export function departmentOfAgent(slug: string): HqDepartmentKey {
  return SUGGESTED_AGENTS.find((s) => s.slug === slug)?.department ?? DEPARTMENT_OF[slug] ?? 'content';
}

/** A department's running agents (from the harness) and the ones still only suggested. */
export function agentsOf(department: HqDepartmentKey, running: HarnessAgent[] | undefined): { running: HarnessAgent[]; suggested: SuggestedAgent[] } {
  const live = (running ?? []).filter((a) => departmentOfAgent(a.slug) === department);
  const known = new Set((running ?? []).map((a) => a.slug));
  return { running: live, suggested: SUGGESTED_AGENTS.filter((s) => s.department === department && !known.has(s.slug)) };
}

/** Suggested agents that could start with what HQ already has. */
export function readyToStart(list: SuggestedAgent[]): SuggestedAgent[] {
  return list.filter((s) => !s.needs);
}
