'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, Check, Copy, KeyRound, Loader2, UserCheck, UserPlus, Users, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTdWrite } from '@/hooks/use-td-content';
import { tdStaffKeys, useTdStaff } from '@/hooks/use-td-staff';
import { TdApiError } from '@/lib/td/api-client';
import { tdAdmin } from '@/lib/td/client';
import { describeTdError, tdApiMessage } from '@/lib/td/errors';
import { checkContract, TD_CONTRACT, type StaffInviteRequest, type StaffPatchRequest } from '@/lib/td/contract';
import { formatGeorgiaTime } from '@/lib/td/georgia';
import { t, tc, tr } from '@/lib/td/i18n';
import { TD_LINK_PATHS } from '@/lib/td/link-fragment';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';
import { TD_ROLE_LABELS, type TdRole, type TdStaffMember } from '@/types/td';
import { TdErrorPanel } from './td-error-panel';
import { TdEmptyState, TdSection } from './td-page';

const rolesFor = (method: string, path: string) => (TD_CONTRACT.routes.find((r) => r.method === method && r.path === path)?.roles ?? []) as TdRole[];
/** Who may invite and make reset links, as the contract's routes say. */
const INVITE_ROLES: readonly TdRole[] = rolesFor('POST', '/admin/staff/invite');
const RESET_LINK_ROLES: readonly TdRole[] = rolesFor('POST', '/admin/staff/:id/reset-link');
const PATCH_ROLES: readonly TdRole[] = rolesFor('PATCH', '/admin/staff/:id');
// Betsson's team has one role; ops is never invited over the API (the server makes ops members).
const INVITED_ROLE = 'betsson_admin' as const;

export const canInvite = (role: TdRole | undefined) => role !== undefined && INVITE_ROLES.includes(role);

/**
 * Whether `actor` gets a Reset link for `member`, as the API decides it: a role the contract allows, never for
 * oneself (change your own password instead) or an ops member (managed on the server), and only for an active member.
 */
export function canMakeResetLink(actor: { id: string; role: TdRole } | null | undefined, member: TdStaffMember): boolean {
  return Boolean(actor && RESET_LINK_ROLES.includes(actor.role) && actor.id !== member.id && member.role !== 'ops' && member.status === 'active');
}

/** Whether `actor` may switch `member` off or on, as the API decides it: never oneself or an ops member. */
export function canManageMember(actor: { id: string; role: TdRole } | null | undefined, member: TdStaffMember): boolean {
  return Boolean(actor && PATCH_ROLES.includes(actor.role) && actor.id !== member.id && member.role !== 'ops');
}

/** The links to hand over: the token rides in the fragment, which never reaches a server. */
export const inviteLink = (origin: string, token: string) => `${origin}${TD_LINK_PATHS.invite}#token=${encodeURIComponent(token)}`;
export const resetLink = (origin: string, token: string) => `${origin}${TD_LINK_PATHS.reset}#token=${encodeURIComponent(token)}`;

/** The API's refusals of team actions, in the workspace's language (another is shown as the API words it). */
const REFUSALS: Record<string, string> = {
  'Your role cannot manage the team': t('Your role cannot manage the team'),
  'You cannot change your own role or status': t('You cannot change your own role or status'),
  'Ops members are managed on the server only': t('Ops members are managed on the server only'),
  'Nobody becomes ops over the API': t('Nobody becomes ops over the API'),
  'Change your own password instead': t('Change your own password instead'),
  'Re-enable them first': t('Re-enable them first'),
  'Not signed up yet: invite them again': t('Not signed up yet: invite them again'),
};
const reason = (error: TdApiError) => {
  const bare = error.message.replace(/\.$/, '');
  const said = Object.hasOwn(REFUSALS, bare) ? REFUSALS[bare] : tdApiMessage(bare);
  return said ? `${said}.` : describeTdError(error).title;
};

/** A reset link refused, in plain words. */
export function resetLinkRefusal(error: unknown, email: string): string {
  if (!(error instanceof TdApiError)) return t('No answer from the Table Derby API, so a link may have been made. Make another: an earlier one then stops working.');
  if (error.code === 'not_found') return t('{email} is no longer on the team.', { email });
  // The API says which rule refused it (your role, yourself, an ops member; not signed up, disabled) in plain words.
  if (error.status === 403 || error.code === 'conflict') return t('No reset link for {email}: {reason}', { email, reason: reason(error) });
  return describeTdError(error).title;
}

/** A one-time link shown once, to copy and send by hand. */
function OneTimeLink({ label, heading, intro, link, expiresAt, again, onDone }: { label: string; heading: string; intro: ReactNode; link: string; expiresAt: string; again: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Straight to the link (and into view): it may appear far from the button that made it.
  useEffect(() => input.current?.focus(), [link]);
  return (
    <section aria-label={heading} className="flex flex-col gap-3 border-b border-(--td-divider) px-5 py-4">
      <p className="text-sm">{intro} {t('Send them this link yourself: the API does not email it.')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input ref={input} readOnly value={link} aria-label={label} onFocus={(event) => event.target.select()} className="h-10 min-w-0 flex-1 rounded-lg bg-(--td-input) font-mono text-xs" />
        <Button
          variant="secondary"
          className="rounded-lg"
          onClick={() => {
            void navigator.clipboard?.writeText(link).then(() => setCopied(true), () => setCopied(false));
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? t('Copied') : t('Copy link')}
        </Button>
      </div>
      <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
        {t('Shown once: it cannot be seen again after you close this. It works once, until {time} (Georgia).', { time: formatGeorgiaTime(expiresAt) })} {again}
      </p>
      <Button variant="ghost" className="w-fit rounded-lg" onClick={onDone}>
        {t('Done')}
      </Button>
    </section>
  );
}

/** A role or status change refused, in plain words. */
export function memberChangeRefusal(error: unknown, email: string): string {
  if (!(error instanceof TdApiError)) return t('No answer from the Table Derby API: look at the list again before you retry.');
  if (error.code === 'not_found') return t('{email} is no longer on the team.', { email });
  if (error.status === 403) return t('{email} was not changed: {reason}', { email, reason: reason(error) });
  return describeTdError(error).title;
}

function inviteRefusal(error: unknown): unknown {
  if (!(error instanceof TdApiError)) return error;
  if (error.code === 'already_exists') return new TdApiError(409, 'already_exists', t('This email already has an account: it cannot be invited again.'));
  if (error.status === 403) return new TdApiError(403, 'forbidden', t('Your role cannot invite members.'));
  return error;
}

function InviteMember({ onClose, onInvited, onBusy }: { onClose: () => void; onInvited: (email: string) => void; onBusy: (busy: boolean) => void }) {
  const write = useTdWrite();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [invited, setInvited] = useState<{ link: string; email: string; expiresAt: string } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body: StaffInviteRequest = { email: email.trim(), role: INVITED_ROLE, ...(name.trim() ? { name: name.trim() } : {}) };
    if (checkContract('StaffInviteRequest', body).length) {
      setError(new TdApiError(400, 'invalid_request', t('Enter a valid email address (and a name of at most 80 characters, or none).')));
      return;
    }
    setBusy(true);
    // Member actions wait for it: a member disabled meanwhile would get a link that no longer works.
    onBusy(true);
    setError(null);
    try {
      const out = await write((operation) => tdAdmin.staff.invite(body, operation), [tdStaffKeys.all]);
      setInvited({ link: inviteLink(window.location.origin, out.token), email: out.member.email, expiresAt: out.expiresAt });
      onInvited(out.member.email);
    } catch (caught) {
      setError(inviteRefusal(caught));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }

  if (invited) {
    return (
      <OneTimeLink
        label={t('Invitation link')}
        heading={t('Invitation link for {email}', { email: invited.email })}
        intro={tr('Invitation for {email}.', {
          email: (
            <span key="email" className="font-mono text-xs">
              {invited.email}
            </span>
          ),
        })}
        link={invited.link}
        expiresAt={invited.expiresAt}
        again={t('Inviting the same email again makes a new link.')}
        onDone={onClose}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 border-b border-(--td-divider) px-5 py-4" noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-(--td-text-3)">
          {t('Email')}
          <Input type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} className="h-10 rounded-lg bg-(--td-input) text-sm text-foreground" />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-(--td-text-3)">
          {t('Name (optional)')}
          <Input value={name} onChange={(event) => setName(event.target.value)} className="h-10 rounded-lg bg-(--td-input) text-sm text-foreground" />
        </label>
      </div>
      <TdErrorPanel error={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="rounded-lg" disabled={busy || !email.trim()}>
          {busy ? <Loader2 className="animate-spin" /> : <UserPlus />}
          {t('Make the invitation link')}
        </Button>
        <Button type="button" variant="ghost" className="rounded-lg" onClick={onClose} disabled={busy}>
          {t('Cancel')}
        </Button>
      </div>
    </form>
  );
}

const COLUMNS = [t('Name'), t('Email'), t('Role'), t('Status'), t('Last sign-in (Georgia)')];

const STATUS_LABELS: Record<TdStaffMember['status'], string> = {
  active: t('active'),
  invited: t('invited'),
  disabled: t('disabled'),
};

const STATUS_STYLES: Record<TdStaffMember['status'], string> = {
  active: 'bg-(--td-new)/15 text-(--td-new)',
  invited: 'bg-amber-50 text-amber-800',
  disabled: 'bg-secondary text-(--td-text-3)',
};

export function TdTeam() {
  const { user } = useTdAuth();
  const write = useTdWrite();
  const { data, isLoading, error, refetch } = useTdStaff();
  const [inviting, setInviting] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [making, setMaking] = useState<string | null>(null);
  const [reset, setReset] = useState<{ email: string; link: string; expiresAt: string } | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState<string | null>(null);
  const resetColumn = Boolean(data?.items.some((member) => canMakeResetLink(user, member) || canManageMember(user, member)));
  const columns = resetColumn ? [...COLUMNS, ''] : COLUMNS;

  // Where focus goes back when a link panel is closed.
  const returnFocus = useRef<HTMLElement | null>(null);
  const inviteButton = useRef<HTMLButtonElement>(null);
  const [inviteClosed, setInviteClosed] = useState(false);
  useEffect(() => {
    if (inviteClosed && !inviting) inviteButton.current?.focus();
  }, [inviteClosed, inviting]);

  const makeResetLink = async (member: TdStaffMember, trigger: HTMLElement) => {
    returnFocus.current = trigger;
    setMaking(member.id);
    setResetError(null);
    setReset(null);
    try {
      const out = await write((operation) => tdAdmin.staff.resetLink(member.id, operation), []);
      setReset({ email: member.email, link: resetLink(window.location.origin, out.token), expiresAt: out.expiresAt });
    } catch (caught) {
      setResetError(resetLinkRefusal(caught, member.email));
      // The list may be behind (disabled, or gone meanwhile): look again.
      void refetch();
    } finally {
      setMaking(null);
    }
  };

  const changeMember = async (member: TdStaffMember, change: StaffPatchRequest) => {
    setChanging(member.id);
    setConfirmDisable(null);
    setResetError(null);
    // Disabling closes their open links: the one on show stops working.
    if (change.status === 'disabled') {
      setReset((shown) => (shown?.email === member.email ? null : shown));
      if (inviting && invitedEmail === member.email) {
        setInviting(false);
        setInvitedEmail(null);
      }
    }
    try {
      await write((operation) => tdAdmin.staff.patch(member.id, change, operation), [tdStaffKeys.all]);
    } catch (caught) {
      setResetError(memberChangeRefusal(caught, member.email));
      void refetch();
    } finally {
      setChanging(null);
    }
  };
  const busyRow = making !== null || changing !== null || inviteBusy;

  return (
    <TdSection
      title={tc('Staff', 'heading')}
      description={t('The API checks every request. Disabling a member signs them out at once; ops members are managed on the server only.')}
      actions={
        canInvite(user?.role) && !inviting ? (
          <Button ref={inviteButton} className="rounded-lg" onClick={() => setInviting(true)}>
            <UserPlus />
            {t('Invite member')}
          </Button>
        ) : undefined
      }
    >
      {inviting && canInvite(user?.role) && (
        <InviteMember
          onInvited={setInvitedEmail}
          onBusy={setInviteBusy}
          onClose={() => {
            setInviting(false);
            setInvitedEmail(null);
            setInviteClosed(true);
          }}
        />
      )}
      {reset && (
        <OneTimeLink
          label={t('Reset link')}
          heading={t('Reset link for {who}', { who: reset.email })}
          intro={tr('Reset link for {email}. Opening it sets a new password and signs them out everywhere else.', {
            email: (
              <span key="email" className="font-mono text-xs">
                {reset.email}
              </span>
            ),
          })}
          link={reset.link}
          expiresAt={reset.expiresAt}
          again={t('Making another reset link for them stops this one.')}
          onDone={() => {
            setReset(null);
            returnFocus.current?.focus();
          }}
        />
      )}
      {resetError && (
        <p role="alert" className="mx-5 mt-4 flex items-start gap-2 rounded-lg bg-(--td-danger)/10 px-3 py-2.5 text-sm text-(--td-danger)">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {resetError}
        </p>
      )}
      {error ? (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <AlertCircle className="size-6 text-(--td-danger)" />
          <p className="text-sm">{describeTdError(error).title}</p>
          <Button variant="secondary" className="rounded-lg" onClick={() => void refetch()}>
            {t('Try again')}
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-(--td-divider) hover:bg-transparent">
              {columns.map((column) => (
                <TableHead key={column || 'actions'} className="h-auto whitespace-normal px-3 py-2 text-xs first:pl-5 font-semibold uppercase tracking-wide text-(--td-text-3)">
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }, (_, row) => (
                <TableRow key={row} className="border-(--td-divider) hover:bg-transparent">
                  {columns.map((column) => (
                    <TableCell key={column || 'actions'} className="px-3 py-4 first:pl-5">
                      <span className="block h-3 w-24 animate-pulse rounded bg-secondary" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {data?.items.map((member) => (
              <TableRow key={member.id} className="border-(--td-divider) hover:bg-secondary/40">
                <TableCell className="py-3 pl-5 pr-3 font-medium">{member.name}</TableCell>
                <TableCell className="max-w-60 whitespace-normal break-all px-3 py-3 font-mono text-xs text-(--td-text-2)">{member.email}</TableCell>
                <TableCell className="whitespace-normal px-3 py-3">{TD_ROLE_LABELS[member.role]}</TableCell>
                <TableCell className="px-3 py-3">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold capitalize', STATUS_STYLES[member.status])}>
                    {STATUS_LABELS[member.status] ?? member.status}
                  </span>
                </TableCell>
                <TableCell className="whitespace-normal px-3 py-3 text-(--td-text-2) tabular-nums">
                  {formatGeorgiaTime(member.lastSignInAt)}
                </TableCell>
                {resetColumn && (
                  <TableCell className="py-2 pl-3 pr-5 text-right">
                    <div className="flex justify-end gap-2">
                    {canMakeResetLink(user, member) && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="rounded-lg"
                        disabled={busyRow}
                        aria-label={t('Reset link for {who}', { who: member.name || member.email })}
                        title={t('Reset link')}
                        onClick={(event) => void makeResetLink(member, event.currentTarget)}
                      >
                        {making === member.id ? <Loader2 className="animate-spin" /> : <KeyRound />}
                        {/* The key alone where the table is narrow (its aria-label names it): the row then fits without scrolling sideways. */}
                        <span className="hidden min-[1600px]:inline">{t('Reset link')}</span>
                      </Button>
                    )}
                    {canManageMember(user, member) &&
                      (member.status === 'disabled' ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="rounded-lg"
                          disabled={busyRow}
                          aria-label={t('Enable {who}', { who: member.name || member.email })}
                          title={t('Enable')}
                          onClick={() => void changeMember(member, { status: 'active' })}
                        >
                          {changing === member.id ? <Loader2 className="animate-spin" /> : <UserCheck />}
                          <span className="hidden min-[1600px]:inline">{t('Enable')}</span>
                        </Button>
                      ) : confirmDisable === member.id ? (
                        <Button variant="destructive" size="sm" className="rounded-lg" disabled={busyRow} onClick={() => void changeMember(member, { status: 'disabled' })}>
                          {changing === member.id ? <Loader2 className="animate-spin" /> : <UserX />}
                          {t('Confirm?')}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-lg text-(--td-danger) hover:bg-(--td-danger)/10"
                          disabled={busyRow}
                          aria-label={t('Disable {who}', { who: member.name || member.email })}
                          title={t('Signs them out at once and closes their open links. Enable them again at any time.')}
                          onClick={() => setConfirmDisable(member.id)}
                        >
                          <UserX />
                          <span className="hidden min-[1600px]:inline">{t('Disable')}</span>
                        </Button>
                      ))}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {data && data.items.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-0">
                  <TdEmptyState icon={Users} title={t('No staff yet')} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </TdSection>
  );
}
