'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TdApiError } from '@/lib/td/api-client';
import { TD_CONFIG } from '@/lib/td/client';
import { safeNextPath } from '@/lib/td/navigation';
import { useTdAuth } from '@/providers/td-auth-provider';
import { TD_ROLE_LABELS } from '@/types/td';
import { TdEnvironmentBadge } from './td-environment-badge';
import { TdFullScreenLoader } from './td-status-screens';
import { TdWordmark } from './td-wordmark';

const MOCK_ACCOUNTS = [
  { email: 'editor@demo.tablederby.test', role: 'editor' },
  { email: 'publisher@demo.tablederby.test', role: 'publisher' },
  { email: 'admin@demo.tablederby.test', role: 'betsson_admin' },
  { email: 'ops@demo.tablederby.test', role: 'ops' },
] as const;

function messageFor(error: unknown): string {
  if (error instanceof TdApiError) {
    if (error.status === 401) return 'Email or password is incorrect.';
    if (error.status === 403) return 'This account has no access to the Table Derby CMS.';
    if (error.status === 429) return 'Too many attempts. Wait a minute and try again.';
    return error.message;
  }
  return 'Could not reach the Table Derby API. Try again.';
}

/** Notes a finished link leaves for the login page: fixed keys, so nothing from the URL is ever shown as text. */
const DONE_NOTES: Record<string, string> = {
  joined: 'You have joined the team. Sign in with your new password.',
  'password-set': 'Your password is set. Sign in with it.',
};

const inputClass = 'h-12 rounded-lg border-border bg-(--td-input) px-4 text-base text-foreground placeholder:text-(--td-text-3)';

export function TdLoginForm() {
  const { status, notice, login } = useTdAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const doneKey = params.get('done');
  const done = doneKey && Object.hasOwn(DONE_NOTES, doneKey) ? DONE_NOTES[doneKey] : null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') router.replace(next);
  }, [status, router, next]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(messageFor(err));
      setSubmitting(false);
    }
  }

  if (status === 'loading' || status === 'authenticated') return <TdFullScreenLoader />;

  const shownError = error ?? notice;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center gap-4">
          <TdWordmark size="lg" />
          <TdEnvironmentBadge />
        </div>

        <form onSubmit={onSubmit} className="rounded-xl border border-border bg-card p-6 sm:p-8" noValidate>
          <h1 className="text-center text-2xl font-bold">Sign in</h1>
          <p className="mt-1 text-center text-sm text-(--td-text-3)">Staff access is by invitation only.</p>

          {done && !shownError && (
            <p role="status" className="mt-6 rounded-lg bg-(--td-new)/10 px-3 py-2.5 text-sm text-(--td-new)">
              {done}
            </p>
          )}

          {shownError && (
            <p role="alert" className="mt-6 flex items-start gap-2 rounded-lg bg-(--td-danger)/10 px-3 py-2.5 text-sm text-(--td-danger)">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {shownError}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <Label htmlFor="td-email" className="text-xs font-medium text-(--td-text-3)">
              Email
            </Label>
            <Input
              id="td-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <Label htmlFor="td-password" className="text-xs font-medium text-(--td-text-3)">
              Password
            </Label>
            <div className="relative">
              <Input
                id="td-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
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
          </div>

          <Button
            type="submit"
            disabled={submitting || !email.trim() || !password}
            className="mt-6 h-12 w-full rounded-lg text-sm font-semibold disabled:bg-(--td-border) disabled:text-(--td-text-3) disabled:opacity-100"
          >
            {submitting ? <Loader2 className="animate-spin" /> : 'Sign in'}
          </Button>
        </form>

        {process.env.NEXT_PUBLIC_TD_API_MOCK === '1' && TD_CONFIG.mock && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-(--td-text-2)">
            <p className="font-semibold text-amber-800">Mock API: demo accounts (password “demo”)</p>
            <ul className="mt-2 flex flex-col gap-1">
              {MOCK_ACCOUNTS.map((account) => (
                <li key={account.email}>
                  <button
                    type="button"
                    className="font-mono text-left text-(--td-text-2) hover:text-foreground"
                    onClick={() => {
                      setEmail(account.email);
                      setPassword('demo');
                    }}
                  >
                    {account.email}
                  </button>{' '}
                  <span className="text-(--td-text-3)">· {TD_ROLE_LABELS[account.role]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
