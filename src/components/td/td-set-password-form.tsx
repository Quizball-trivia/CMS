'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TdApiError } from '@/lib/td/api-client';
import { checkContract } from '@/lib/td/contract';
import { t, tr } from '@/lib/td/i18n';
import { TD_LINK_PATHS } from '@/lib/td/link-fragment';
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
  if (length < PASSWORD_MIN) return t('Use at least {min} characters.', { min: PASSWORD_MIN });
  if (length > PASSWORD_MAX) return t('Use at most {max} characters.', { max: PASSWORD_MAX });
  if (password !== confirm) return t('The two passwords are not the same.');
  return null;
}

/**
 * `unanswered`: an earlier try of this form got no answer, so it may have gone through; a spent link is then
 * most likely spent by it, and signing in (not a new link) is the way on.
 */
export function linkRefusal(error: unknown, kind: TdLinkKind, unanswered = false): string {
  if (!(error instanceof TdApiError)) {
    return t('No answer from the Table Derby API. It may have gone through: try signing in with the password you chose, or send this again.');
  }
  switch (error.code) {
    case 'invalid_token':
      if (unanswered) return t('This link is used now, most likely by your try that got no answer: sign in with the password you chose.');
      return kind === 'invite'
        ? t('This invitation link has expired or was already used. If you already joined, sign in; otherwise ask a team manager for a new one.')
        : t('This reset link has expired or was already used. If you already set a new password, sign in; otherwise ask a team manager for a new one.');
    case 'weak_password':
      return t('The API refused this password: use {min} to {max} characters.', { min: PASSWORD_MIN, max: PASSWORD_MAX });
    case 'rate_limited':
      return t('Too many attempts. Wait a minute and try again.');
    case 'invalid_request':
      return kind === 'invite' ? t('Check your name and password and try again.') : t('Check your password and try again.');
    case 'busy':
    case 'internal':
      return t('The Table Derby API could not take this just now. Try again in a moment.');
    default:
      return error.message;
  }
}

/**
 * The token, read once per page load: the fragment is cleared as soon as it is read (before hydration by
 * LINK_FRAGMENT_SCRIPT, else here), so a second effect run (StrictMode) or a remount finds the captured copy.
 */
const captured: Partial<Record<TdLinkKind, string | null>> = {};

/** Takes the token of a fragment in the address bar now (a new link on the same page included) and clears it. */
function takeFragment(kind: TdLinkKind): string | null {
  captured[kind] = linkTokenFrom(window.location.hash);
  // A state without Next's own marker, so its router takes the new URL too and never restores the fragment.
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  return captured[kind] ?? null;
}

function takeLinkToken(kind: TdLinkKind): string | null {
  const early = window.__tdLinkToken;
  if (early && early.path === TD_LINK_PATHS[kind]) {
    delete window.__tdLinkToken;
    captured[kind] = early.token && linkTokenFrom(`#token=${encodeURIComponent(early.token)}`);
  }
  if (window.location.hash) return takeFragment(kind);
  return kind in captured ? (captured[kind] ?? null) : null;
}

const firstLink = (kind: TdLinkKind) => ({ token: takeLinkToken(kind), version: 1 });

/** Forgets captured tokens (tests). */
export function forgetLinkTokens() {
  for (const kind of Object.keys(captured) as TdLinkKind[]) delete captured[kind];
}

/** Forgets a redeemed token, and only that one: a newer link opened meanwhile keeps its own. */
function forgetSpent(kind: TdLinkKind, token: string) {
  if (captured[kind] === token) delete captured[kind];
}

const inputClass = 'h-12 rounded-lg border-border bg-(--td-input) px-4 text-base text-foreground placeholder:text-(--td-text-3)';

const COPY: Record<TdLinkKind, { title: string; lead: string; submit: string; done: string }> = {
  invite: { title: t('Join the team'), lead: t('Choose your name and a password to finish your invitation.'), submit: t('Join'), done: 'joined' },
  reset: { title: t('Set a new password'), lead: t('Choose a new password for your account.'), submit: t('Set password'), done: 'password-set' },
};

/** Redeems an invitation or reset link (`/td/accept-invite#token=…`, `/td/reset#token=…`). */
export function TdSetPasswordForm({ kind }: { kind: TdLinkKind }) {
  // undefined: not read yet (the fragment exists only in the browser); null: missing or damaged. Each new link
  // (another fragment on this same page) starts a fresh form, so nothing typed for one link goes with the next.
  const [link, setLink] = useState<{ token: string | null; version: number } | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address bar is only readable after mount
    setLink(firstLink(kind));
    const onFragment = () => {
      // Only this page's own links: on the way to the other link page (a popstate across routes) its fragment is left for it.
      if (!window.location.hash || window.location.pathname !== TD_LINK_PATHS[kind]) return;
      const token = takeFragment(kind);
      setLink((current) => ({ token, version: (current?.version ?? 0) + 1 }));
    };
    window.addEventListener('hashchange', onFragment);
    window.addEventListener('popstate', onFragment);
    // The App Router's own navigations (router.push, <Link>) change the URL with pushState, which fires no event:
    // a light check keeps a new link from ever sitting beside the old one's form.
    const watch = window.setInterval(onFragment, 250);
    return () => {
      window.removeEventListener('hashchange', onFragment);
      window.removeEventListener('popstate', onFragment);
      window.clearInterval(watch);
    };
  }, [kind]);

  if (!link) return <TdFullScreenLoader />;
  return <LinkForm key={link.version} kind={kind} token={link.token} />;
}

function LinkForm({ kind, token }: { kind: TdLinkKind; token: string | null }) {
  const { status, user, acceptInvite, resetPassword, logout, retry } = useTdAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [unanswered, setUnanswered] = useState(false);
  // The link is spent and the password set, but no session came of it here.
  const [setWithoutSession, setSetWithoutSession] = useState(false);
  // False once another link replaced this form: its late answer must not steer the page away from the new one.
  const current = useRef(true);
  // Replaced, or about to be: a fragment in the address bar is always a new link not taken yet (ours is cleared).
  const replaced = useCallback(() => !current.current || window.location.hash !== '', []);
  useEffect(() => {
    current.current = true;
    return () => {
      current.current = false;
    };
  }, []);

  const copy = COPY[kind];
  const done = `${TD_ROOT}/login?done=${copy.done}`;
  const trimmedName = name.trim();
  const problem = passwordProblem(password, confirm) ?? (kind === 'invite' && (trimmedName === '' || [...trimmedName].length > 80) ? t('Enter your name (at most 80 characters).') : null);

  useEffect(() => {
    // Nobody signed in: the login page, with its note, is the way on.
    if (setWithoutSession && status === 'anonymous' && !replaced()) router.replace(done);
  }, [setWithoutSession, status, router, done, replaced]);

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
      forgetSpent(kind, token);
      if (replaced()) return;
      if (member) router.replace(TD_ROOT);
      else setSetWithoutSession(true);
    } catch (caught) {
      if (replaced()) return;
      setError(linkRefusal(caught, kind, unanswered));
      if (!(caught instanceof TdApiError)) setUnanswered(true);
      setSubmitting(false);
    }
  }

  const frame = (body: ReactNode) => (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center gap-4">
          <TdWordmark size="lg" />
          <TdEnvironmentBadge />
        </div>
        {body}
      </div>
    </div>
  );

  if (setWithoutSession) {
    // Someone is still signed in (the earlier account, or one who signed in meanwhile): theirs is never ended silently.
    if (status === 'unavailable') {
      return frame(
        <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
          <h1 className="text-center text-2xl font-bold">{kind === 'invite' ? t('You have joined') : t('Password set')}</h1>
          <p role="status" className="mt-4 text-sm text-(--td-text-2)">
            {kind === 'invite'
              ? t('Your account is ready, but the Table Derby API could not be reached to check who is signed in on this browser.')
              : t('Your new password is set, but the Table Derby API could not be reached to check who is signed in on this browser.')}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button className="h-11 rounded-lg" onClick={retry}>
              {t('Try again')}
            </Button>
            <Button variant="secondary" className="h-11 rounded-lg" onClick={() => router.replace(done)}>
              {t('Go to sign in')}
            </Button>
          </div>
        </div>,
      );
    }
    if (status !== 'authenticated' || !user) return <TdFullScreenLoader />;
    return frame(
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <h1 className="text-center text-2xl font-bold">{kind === 'invite' ? t('You have joined') : t('Password set')}</h1>
        <p role="status" className="mt-4 text-sm text-(--td-text-2)">
          {kind === 'invite'
            ? t('Your account is ready, but this browser is still signed in as {name}.', { name: user.name })
            : t('Your new password is set, but this browser is still signed in as {name}.', { name: user.name })}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button
            className="h-11 rounded-lg"
            onClick={async () => {
              await logout();
              router.replace(done);
            }}
          >
            {t('Sign out and sign in with the new password')}
          </Button>
          <Button variant="secondary" className="h-11 rounded-lg" onClick={() => router.replace(TD_ROOT)}>
            {t('Stay signed in as {name}', { name: user.name })}
          </Button>
        </div>
      </div>,
    );
  }

  return frame(
    token === null ? (
      <div className="rounded-xl border border-border bg-card p-6 text-center sm:p-8">
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p role="alert" className="mt-4 text-sm text-(--td-danger)">
          {t('This link is incomplete or damaged. Open the whole link you were given, or ask a team manager for a new one.')}
        </p>
        <Link href={`${TD_ROOT}/login`} className="mt-6 inline-block text-sm text-primary underline">
          {t('Go to sign in')}
        </Link>
      </div>
    ) : (
      <form onSubmit={onSubmit} className="rounded-xl border border-border bg-card p-6 sm:p-8" noValidate>
        <h1 className="text-center text-2xl font-bold">{copy.title}</h1>
        <p className="mt-1 text-center text-sm text-(--td-text-3)">{copy.lead}</p>

        {status === 'authenticated' && user && (
          <p className="mt-6 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-700">
            {t('You are signed in as {name}. Finishing here signs you in with this account instead.', { name: user.name })}
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
              {t('Your name')}
            </Label>
            <Input id="td-name" autoComplete="name" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <Label htmlFor="td-new-password" className="text-xs font-medium text-(--td-text-3)">
            {t('New password')}
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
              aria-label={showPassword ? t('Hide password') : t('Show password')}
              className="absolute inset-y-0 right-0 grid w-12 place-items-center text-(--td-text-3) hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <p className="text-xs text-(--td-text-3)">
            {t('{min} to {max} characters. A long phrase is easier to remember than a short, complicated word.', { min: PASSWORD_MIN, max: PASSWORD_MAX })}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <Label htmlFor="td-confirm-password" className="text-xs font-medium text-(--td-text-3)">
            {t('Repeat the password')}
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
        <p className="mt-4 text-center text-xs text-(--td-text-3)">
          {tr('Already set your password? {link}', {
            link: (
              <Link key="link" href={`${TD_ROOT}/login`} className="text-primary underline">
                {t('Sign in')}
              </Link>
            ),
          })}
        </p>
      </form>
    ),
  );
}
