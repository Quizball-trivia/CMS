'use client';

import Link from 'next/link';
import { notFound, usePathname } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { useHarnessOverview } from '@/hooks';
import { useAuth } from '@/providers';
import { agentsOf, atWork, readyToStart } from '@/lib/hq-agents';
import { DEPARTMENT_LOOK, departmentByKey, toolsForUser } from '@/lib/hq-departments';
import { AgentRoster } from '../agents-ui';
import { Reports } from '../reports';
import { Hero, HeroStat, HQ_PAGE, LoadErrorState, RefreshErrorBanner, Section } from '../hq-ui';

// A department's page: what it is for, the agents working for it, the agents
// it could have, and its tools. Content and Games have fuller pages of their
// own (/hq/content, /hq/games); every other department opens here.

export default function DepartmentPage() {
  // The last part of the address, so the page also works where it is mounted under another route (the local preview).
  const department = usePathname().split('/').filter(Boolean).pop() ?? '';
  const { user } = useAuth();
  const overview = useHarnessOverview();
  const d = departmentByKey(department);
  if (!d || d.home !== `/hq/${department}` || d.key === 'content' || d.key === 'games') notFound();
  const look = DEPARTMENT_LOOK[d.key];
  const Icon = look.icon;
  const team = agentsOf(d.key, overview.data?.agents);
  const tools = toolsForUser(d, user?.email);
  const work = atWork(team.running, overview.data?.settings.paused);

  return (
    <div className={HQ_PAGE}>
      <Hero
        eyebrow={d.lead ? `Department · led by ${d.lead}` : 'Department'}
        icon={<Icon className="size-7 shrink-0 opacity-90" aria-hidden />}
        title={d.name}
        description={d.mission}
        glow={look.hex}
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <HeroStat label="Agents at work" value={overview.data ? work.on : '…'} note={work.paused ? `${work.paused} paused` : undefined} tone={work.on ? 'good' : undefined} />
          <HeroStat label="Suggested" value={overview.data ? team.suggested.length : '…'} note="agents it could have" />
          <HeroStat label="Can start now" value={overview.data ? readyToStart(team.suggested).length : '…'} note="need nothing from us" />
          <HeroStat label="Tools" value={tools.length} note={tools.length ? 'pages in the CMS' : 'none yet'} />
        </div>
      </Hero>

      <Reports department={d.key} />

      {overview.error && !overview.data ? (
        // Without the list of running agents nobody can say which ones are still only suggestions.
        <LoadErrorState error={overview.error} fallback="Could not load this department's agents" onRetry={() => void overview.refetch()} />
      ) : (
        <>
          {overview.error && <RefreshErrorBanner />}
          <AgentRoster department={d.key} agents={overview.data?.agents} loading={!overview.data} allPaused={overview.data?.settings.paused} />
        </>
      )}

      {tools.length > 0 && (
        <Section title="Tools" description="The pages people use for this department today.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {tools.map((t) => (
              <Link key={t.href} href={t.href} className="hq-card group flex items-start gap-3 p-4">
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${look.tint}`} aria-hidden>
                  <t.icon className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-950">{t.title}</span>
                  <span className="block text-[13px] leading-relaxed text-slate-600">{t.description}</span>
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-slate-300 transition group-hover:text-slate-900" aria-hidden />
              </Link>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
