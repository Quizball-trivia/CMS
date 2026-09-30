'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TdApiError } from '@/lib/td/api-client';
import { checkContract } from '@/lib/td/contract';
import { TD_ROOT } from '@/lib/workspace-guard';
import { useTdAuth } from '@/providers/td-auth-provider';
import { TdEnvironmentBadge } from './td-environment-badge';
import { TdFullScreenLoader } from './td-status-screens';
import { TdWordmark } from './td-wordmark';

export type TdLinkKind = 'invite' | 'reset';

/** The API's rules for a new password (contract `password`): 12 to 256 characters, counted as code points. */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 256;
const LINK_TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

/** The one-time token from `#token=…`: a fragment never reaches a server or its logs. */
export function linkTokenFrom(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token');
  return token && LINK_TOKEN.test(token) ? token : null;
}

export function passwordProblem(password: string, confirm: string): string | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (password !== confirm) return 'The two passwords are not the same.';
  return null;
}

export function linkRefusal(error: unknown, kind: TdLinkKind): string {
  if (!(error instanceof TdApiError)) {
    return 'No answer from the Table Derby API. If you already sent this form once, your password may be set: try signing in with it.';
  }
  switch (error.code) {
    case 'invalid_token':
      return kind === 'invite'
        ? 'This invitation link has expired or was already used. Ask a team manager for a new one.'
        : 'This reset link has expired or was already used. Ask a team manager for a new one.';
    case 'weak_password':
      return `The API refused this password: use ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`;
    case 'rate_limited':
      return 'Too many attempts. Wait a minute and try again.';
    case 'invalid_request':
      return kind === 'invite' ? 'Check your name and password and try again.' : 'Check your password and try again.';
    case 'busy':
    case 'internal':
      return 'The Table Derby API could not take this just now. Try again in a moment.';
    default:
      return error.message;
  }
}

const inputClass = 'h-12 rounded-lg border-border bg-(--td-input) px-4 text-base text-foreground placeholder:text-(--td-text-3)';

const COPY: Record<TdLinkKind, { title: string; lead: string; submit: string; done: string }> = {
  invite: { title: 'Join the team', lead: 'Choose your name and a password to finish your invitation.', submit: 'Join', done: 'joined' },
  reset: { title: 'Set a new password', lead: 'Choose a new password for your account.', submit: 'Set password', done: 'password-set' },
};

/** Redeems an invitation or reset link (`/td/accept-invite#token=…`, `/td/reset#token=…`). */
export function TdSetPasswordForm({ kind }: { kind: TdLinkKind }) {
  const { status, user, acceptInvite, resetPassword } = useTdAuth();
  const router = useRouter();
  // undefined: not read yet (the fragment exists only in the browser); null: missing or damaged.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    // Read once, then gone from the address bar (and so from history, bookmarks and screen shares).
    const read = linkTokenFrom(window.location.hash);
    if (window.location.hash) window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the fragment is only readable after mount
    setToken(read);
  }, []);

  const copy = COPY[kind];
  const trimmedName = name.trim();
  const problem = passwordProblem(password, confirm) ?? (kind === 'invite' && (trimmedName === '' || [...trimmedName].length > 80) ? 'Enter your name (at most 80 characters).' : null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTried(true);
    if (!token || problem) return;
    const body = kind === 'invite' ? { token, password, name: trimmedName } : { token, password };
    if (checkContract(kind === 'invite' ? 'AcceptInviteRequest' : 'PasswordResetRequest', body).length) {
      setError(linkRefusal(new TdApiError(400, 'invalid_request', 'The request is not valid'), kind));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const member = kind === 'invite' ? await acceptInvite(token, password, trimmedName) : await resetPassword(token, password);
      // Signed in with the session the API answered; without one, the password is set all the same.
      router.replace(member ? TD_ROOT : `${TD_ROOT}/login?done=${copy.done}`);
    } catch (caught) {
      setError(linkRefusal(caught, kind));
      setSubmitting(false);
    }
  }

  if (token === undefined) return <TdFullScreenLoader />;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center gap-4">
          <TdWordmark size="lg" />
          <TdEnvironmentBadge />
        </div>

        {token === null ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center sm:p-8">
            <h1 className="text-2xl font-bold">{copy.title}</h1>
            <p role="alert" className="mt-4 text-sm text-(--td-danger)">
              This link is incomplete or damaged. Open the whole link you were given, or ask a team manager for a new one.
            </p>
            <Link href={`${TD_ROOT}/login`} className="mt-6 inline-block text-sm text-primary underline">
              Go to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="rounded-xl border border-border bg-card p-6 sm:p-8" noValidate>
            <h1 className="text-center text-2xl font-bold">{copy.title}</h1>
            <p className="mt-1 text-center text-sm text-(--td-text-3)">{copy.lead}</p>

            {status === 'authenticated' && user && (
              <p className="mt-6 rounded-lg bg-amber-400/10 px-3 py-2.5 text-sm text-amber-200">
                You are signed in as {user.name}. Finishing here signs you in with this account instead.
              </p>
            )}

            {(error ?? (tried ? problem : null)) && (
              <p role="alert" className="mt-6 flex items-start gap-2 rounded-lg bg-(--td-danger)/10 px-3 py-2.5 text-sm text-(--td-danger)">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                {error ?? problem}
              </p>
            )}

            {kind === 'invite' && (
              <div className="mt-6 flex flex-col gap-2">
                <Label htmlFor="td-name" className="text-xs font-medium text-(--td-text-3)">
                  Your name
                </Label>
                <Input id="td-name" autoComplete="name" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2">
              <Label htmlFor="td-new-password" className="text-xs font-medium text-(--td-text-3)">
                New password
              </Label>
              <div className="relative">
                <Input
                  id="td-new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 grid w-12 place-items-center text-(--td-text-3) hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-xs text-(--td-text-3)">
                {PASSWORD_MIN} to {PASSWORD_MAX} characters. A long phrase is easier to remember than a short, complicated word.
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <Label htmlFor="td-confirm-password" className="text-xs font-medium text-(--td-text-3)">
                Repeat the password
              </Label>
              <Input
                id="td-confirm-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className={inputClass}
              />
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="mt-6 h-12 w-full rounded-lg text-sm font-semibold disabled:bg-(--td-border) disabled:text-(--td-text-3) disabled:opacity-100"
            >
              {submitting ? <Loader2 className="animate-spin" /> : copy.submit}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
