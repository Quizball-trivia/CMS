'use client';

import { AlertCircle, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTdStaff } from '@/hooks/use-td-staff';
import { cn } from '@/lib/utils';
import { TD_ROLE_LABELS, type TdStaffMember } from '@/types/td';
import { TdEmptyState, TdSection } from './td-page';

const COLUMNS = ['Name', 'Email', 'Role', 'Status', 'Last sign-in (Georgia)'];

const signInFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tbilisi', dateStyle: 'medium', timeStyle: 'short' });

const STATUS_STYLES: Record<TdStaffMember['status'], string> = {
  active: 'bg-(--td-new)/15 text-(--td-new)',
  invited: 'bg-amber-400/10 text-amber-300',
  disabled: 'bg-secondary text-(--td-text-3)',
};

export function TdTeam() {
  const { data, isLoading, error, refetch } = useTdStaff();

  return (
    <TdSection
      title="Staff"
      description="Roles are enforced by the API on every request. Nobody can grant or remove the ops role here."
      actions={
        <Button disabled className="rounded-lg" title="Invites are not in this CMS build yet">
          <UserPlus />
          Invite
        </Button>
      }
    >
      {error ? (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <AlertCircle className="size-6 text-(--td-danger)" />
          <p className="text-sm">{error.message}</p>
          <Button variant="secondary" className="rounded-lg" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-(--td-divider) hover:bg-transparent">
              {COLUMNS.map((column) => (
                <TableHead key={column} className="h-10 px-5 text-xs font-semibold uppercase tracking-wide text-(--td-text-3)">
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }, (_, row) => (
                <TableRow key={row} className="border-(--td-divider) hover:bg-transparent">
                  {COLUMNS.map((column) => (
                    <TableCell key={column} className="px-5 py-4">
                      <span className="block h-3 w-24 animate-pulse rounded bg-secondary" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {data?.items.map((member) => (
              <TableRow key={member.id} className="border-(--td-divider) hover:bg-secondary/40">
                <TableCell className="px-5 py-3 font-medium">{member.name}</TableCell>
                <TableCell className="px-5 py-3 font-mono text-xs text-(--td-text-2)">{member.email}</TableCell>
                <TableCell className="px-5 py-3">{TD_ROLE_LABELS[member.role]}</TableCell>
                <TableCell className="px-5 py-3">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold capitalize', STATUS_STYLES[member.status])}>
                    {member.status}
                  </span>
                </TableCell>
                <TableCell className="px-5 py-3 text-(--td-text-2) tabular-nums">
                  {member.lastSignInAt ? signInFormat.format(new Date(member.lastSignInAt)) : '—'}
                </TableCell>
              </TableRow>
            ))}
            {data && data.items.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={COLUMNS.length} className="p-0">
                  <TdEmptyState icon={Users} title="No staff yet" />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </TdSection>
  );
}
