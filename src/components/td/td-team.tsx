'use client';

import { useState, type FormEvent } from 'react';
import { AlertCircle, Check, Copy, Loader2, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTdWrite } from '@/hooks/use-td-content';
import { tdStaffKeys, useTdStaff } from '@/hooks/use-td-staff';
import { TdApiError } from '@/lib/td/api-client';
import { tdAdmin } from '@/lib/td/client';
import { checkContract, TD_CONTRACT, type StaffInviteRequest } from '@/lib/td/contract';
import { formatGeorgiaTime } from '@/lib/td/georgia';
import { TD_ROOT } from '@/lib/workspace-guard';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';
import { TD_ROLE_LABELS, type TdRole, type TdStaffMember } from '@/types/td';
import { TdErrorPanel } from './td-error-panel';
import { TdEmptyState, TdSection } from './td-page';

/** Who may invite, as the contract's route says; ops is never invited over the API (the server makes ops members). */
const INVITE_ROLES: readonly TdRole[] = (TD_CONTRACT.routes.find((r) => r.method === 'POST' && r.path === '/admin/staff/invite')?.roles ?? []) as TdRole[];
const INVITABLE: readonly Exclude<TdRole, 'ops'>[] = ['editor', 'publisher', 'betsson_admin'];

export const canInvite = (role: TdRole | undefined) => role !== undefined && INVITE_ROLES.includes(role);

/** The link to hand over: the token rides in the fragment, which never reaches a server. */
export const inviteLink = (origin: string, token: string) => `${origin}${TD_ROOT}/accept-invite#token=${encodeURIComponent(token)}`;

function inviteRefusal(error: unknown): unknown {
  if (!(error instanceof TdApiError)) return error;
  if (error.code === 'already_exists') return new TdApiError(409, 'already_exists', 'This email already has an account: it cannot be invited again.');
  if (error.status === 403) return new TdApiError(403, 'forbidden', 'Your role cannot invite this role.');
  return error;
}

function InviteMember({ onClose }: { onClose: () => void }) {
  const write = useTdWrite();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Exclude<TdRole, 'ops'>>('editor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [invited, setInvited] = useState<{ link: string; email: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body: StaffInviteRequest = { email: email.trim(), role, ...(name.trim() ? { name: name.trim() } : {}) };
    if (checkContract('StaffInviteRequest', body).length) {
      setError(new TdApiError(400, 'invalid_request', 'Enter a valid email address (and a name of at most 80 characters, or none).'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const out = await write((operation) => tdAdmin.staff.invite(body, operation), [tdStaffKeys.all]);
      setInvited({ link: inviteLink(window.location.origin, out.token), email: out.member.email, expiresAt: out.expiresAt });
    } catch (caught) {
      setError(inviteRefusal(caught));
    } finally {
      setBusy(false);
    }
  }

  if (invited) {
    return (
      <div className="flex flex-col gap-3 border-b border-(--td-divider) px-5 py-4">
        <p className="text-sm">
          Invitation for <span className="font-mono text-xs">{invited.email}</span>. Send them this link yourself: the API does not email it.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input readOnly value={invited.link} aria-label="Invitation link" onFocus={(event) => event.target.select()} className="h-10 min-w-0 flex-1 rounded-lg bg-(--td-input) font-mono text-xs" />
          <Button
            variant="secondary"
            className="rounded-lg"
            onClick={() => {
              void navigator.clipboard?.writeText(invited.link).then(() => setCopied(true), () => setCopied(false));
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </div>
        <p role="alert" className="rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          Shown once: it cannot be seen again after you close this. It works once, until {formatGeorgiaTime(invited.expiresAt)} (Georgia). Inviting the same email again makes a new link.
        </p>
        <Button variant="ghost" className="w-fit rounded-lg" onClick={onClose}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 border-b border-(--td-divider) px-5 py-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_12rem]">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-(--td-text-3)">
          Email
          <Input type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} className="h-10 rounded-lg bg-(--td-input) text-sm text-foreground" />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-(--td-text-3)">
          Name (optional)
          <Input value={name} onChange={(event) => setName(event.target.value)} className="h-10 rounded-lg bg-(--td-input) text-sm text-foreground" />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-(--td-text-3)">
          Role
          <select value={role} onChange={(event) => setRole(event.target.value as Exclude<TdRole, 'ops'>)} className="h-10 rounded-lg border border-border bg-(--td-input) px-3 text-sm text-foreground">
            {INVITABLE.map((r) => (
              <option key={r} value={r}>
                {TD_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <TdErrorPanel error={error} />
      <div className="flex gap-2">
        <Button type="submit" className="rounded-lg" disabled={busy || !email.trim()}>
          {busy ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Make the invitation link
        </Button>
        <Button type="button" variant="ghost" className="rounded-lg" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const COLUMNS = ['Name', 'Email', 'Role', 'Status', 'Last sign-in (Georgia)'];

const signInFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tbilisi', dateStyle: 'medium', timeStyle: 'short' });

const STATUS_STYLES: Record<TdStaffMember['status'], string> = {
  active: 'bg-(--td-new)/15 text-(--td-new)',
  invited: 'bg-amber-400/10 text-amber-300',
  disabled: 'bg-secondary text-(--td-text-3)',
};

export function TdTeam() {
  const { user } = useTdAuth();
  const { data, isLoading, error, refetch } = useTdStaff();
  const [inviting, setInviting] = useState(false);

  return (
    <TdSection
      title="Staff"
      description="Roles are enforced by the API on every request. Nobody can grant or remove the ops role here."
      actions={
        canInvite(user?.role) && !inviting ? (
          <Button className="rounded-lg" onClick={() => setInviting(true)}>
            <UserPlus />
            Invite member
          </Button>
        ) : undefined
      }
    >
      {inviting && canInvite(user?.role) && <InviteMember onClose={() => setInviting(false)} />}
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
