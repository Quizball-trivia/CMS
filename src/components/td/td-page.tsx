import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getTab, type TdTabKey } from '@/lib/td/navigation';
import { cn } from '@/lib/utils';
import { TdTabGate } from './td-tab-gate';
import { TD_TAB_ICONS } from './td-tab-icons';

export function TdPageHeader({ tabKey, actions }: { tabKey: TdTabKey; actions?: ReactNode }) {
  const tab = getTab(tabKey);
  const Icon = TD_TAB_ICONS[tab.key];
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-baseline gap-x-3 text-2xl font-bold leading-tight text-foreground">
            {tab.label}
            {tab.hint && <span className="text-sm font-medium text-(--td-text-3)">{tab.hint}</span>}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-(--td-text-2)">{tab.description}</p>
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function TdSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
      <div className="flex flex-col gap-2 border-b border-(--td-divider) px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-(--td-text-3)">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function TdEmptyState({ icon: Icon, title, children }: { icon?: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {Icon && (
        <span className="mb-1 grid size-12 place-items-center rounded-full bg-secondary text-(--td-text-3)">
          <Icon className="size-5" />
        </span>
      )}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {children && <p className="max-w-md text-sm text-(--td-text-3)">{children}</p>}
    </div>
  );
}

/** Column headers with an empty body: the shape of a list whose data is not wired yet. */
export function TdPlaceholderTable({
  columns,
  emptyTitle,
  emptyBody,
  icon,
}: {
  columns: string[];
  emptyTitle: string;
  emptyBody?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-(--td-divider) hover:bg-transparent">
          {columns.map((column) => (
            <TableHead key={column} className="h-10 px-5 text-xs font-semibold uppercase tracking-wide text-(--td-text-3)">
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={columns.length} className="p-0">
            <TdEmptyState icon={icon} title={emptyTitle}>
              {emptyBody}
            </TdEmptyState>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

/** Every console page renders through this: it names the page's own tab, which the role gate uses. */
export function TdTabPage({ tab, actions, children }: { tab: TdTabKey; actions?: ReactNode; children?: ReactNode }) {
  return (
    <TdTabGate tab={tab}>
      <TdPageHeader tabKey={tab} actions={actions} />
      {children}
    </TdTabGate>
  );
}
