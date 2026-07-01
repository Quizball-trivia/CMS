'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Bot, CalendarClock, FileText, BarChart3, Layers, LayoutList } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AgentEventLevel, AgentJobStatus, AgentTaskDecision } from '@/types';

// Shared tab bar across all Agents pages. Keeps navigation consistent and shows
// where you are. Active = exact match, except /agents (Jobs) which also matches
// job-detail routes (/agents/<uuid>).
const AGENT_TABS = [
  { href: '/agents', label: 'Jobs', icon: LayoutList },
  { href: '/agents/activity', label: 'Activity', icon: Activity },
  { href: '/agents/daily', label: 'Daily Challenges', icon: CalendarClock },
  { href: '/agents/stats', label: 'Stats', icon: BarChart3 },
  { href: '/agents/sub-agents', label: 'Sub-agents', icon: Bot },
  { href: '/agents/question-types', label: 'Question Types', icon: Layers },
  { href: '/agents/prompts', label: 'Prompts', icon: FileText },
] as const;

export function AgentNav() {
  const pathname = usePathname();
  const isActive = (href: string) => {
    if (href === '/agents') {
      // Jobs tab: active on /agents and job-detail (/agents/<id>), but not the other tabs
      const others = AGENT_TABS.filter((t) => t.href !== '/agents').map((t) => t.href);
      return pathname === '/agents' || (pathname.startsWith('/agents/') && !others.some((o) => pathname.startsWith(o)));
    }
    return pathname === href || pathname.startsWith(href + '/');
  };
  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200 pb-px">
      {AGENT_TABS.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

const STATUS_STYLES: Record<AgentJobStatus, string> = {
  queued: 'border-slate-200 bg-slate-100 text-slate-600',
  running: 'border-blue-200 bg-blue-50 text-blue-700',
  dispatched: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  partial: 'border-amber-200 bg-amber-50 text-amber-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
  cancelled: 'border-slate-200 bg-slate-100 text-slate-500',
};

const STATUS_LABELS: Record<AgentJobStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  dispatched: 'Dispatched',
  completed: 'Completed',
  partial: 'Partial',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const ACTIVE_JOB_STATUSES: AgentJobStatus[] = ['queued', 'running', 'dispatched'];

export function isActiveJobStatus(status: AgentJobStatus): boolean {
  return ACTIVE_JOB_STATUSES.includes(status);
}

export function JobStatusBadge({ status, className }: { status: AgentJobStatus; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(STATUS_STYLES[status] ?? 'border-slate-200 bg-slate-100 text-slate-600', className)}
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function DecisionBadge({ decision }: { decision: AgentTaskDecision | null }) {
  if (!decision) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  const approved = decision === 'approved';
  const rejected = decision === 'rejected';
  return (
    <Badge
      variant="outline"
      className={cn(
        approved && 'border-emerald-200 bg-emerald-50 text-emerald-700',
        rejected && 'border-red-200 bg-red-50 text-red-700',
        !approved && !rejected && 'border-slate-200 bg-slate-100 text-slate-600'
      )}
    >
      {decision}
    </Badge>
  );
}

export function EventLevelDot({ level }: { level: AgentEventLevel }) {
  const color =
    level === 'error'
      ? 'bg-red-500'
      : level === 'warn'
        ? 'bg-amber-500'
        : 'bg-slate-300';
  return <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', color)} />;
}

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '$0.00';
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return date.toLocaleDateString();
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
