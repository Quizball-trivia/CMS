'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SESSION_CHANGED, TdApiError } from '@/lib/td/api-client';
import { tdApi, tdLock, tdRefresh, tdTokens } from '@/lib/td/client';
import { newGeneration, type TdSession } from '@/lib/td/token-store';
import type { TdStaff } from '@/types/td';

export type TdAuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'unavailable';

interface TdAuthState {
  status: TdAuthStatus;
  user: TdStaff | null;
  /** Why the last sign-in ended, shown on the login page. */
  notice: string | null;
}

interface TdAuthContextValue extends TdAuthState {
  login(email: string, password: string): Promise<TdStaff>;
  logout(): Promise<void>;
  retry(): void;
}

const TdAuthContext = createContext<TdAuthContextValue | null>(null);

const RENEW_BEFORE_EXPIRY_MS = 2 * 60_000;
const RENEW_CHECK_INTERVAL_MS = 30_000;
const SESSION_ENDED = 'Your session has ended. Please sign in again.';
const NO_ACCESS = 'This account has no access to the Table Derby CMS.';

function nearExpiry(session: TdSession): boolean {
  return session.expiresAt !== null && Date.now() > session.expiresAt - RENEW_BEFORE_EXPIRY_MS;
}

/** Sign-in, sign-out and refresh commits share one cross-tab lock. */
async function withSessionLock<T>(task: () => T): Promise<T> {
  const lock = tdLock();
  return lock ? lock.run(async () => task()) : task();
}

export function useTdAuth(): TdAuthContextValue {
  const context = useContext(TdAuthContext);
  if (!context) throw new Error('useTdAuth must be used within a TdAuthProvider');
  return context;
}

export function TdAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<TdAuthState>({ status: 'loading', user: null, notice: null });
  // The session generation the shown identity belongs to (or is being resolved for).
  const activeGeneration = useRef<string | null>(null);
  // Signed out in this tab; its storage clear may still be queued behind a refresh.
  const endedGeneration = useRef<string | null>(null);

  const becomeAnonymous = useCallback(
    (notice: string | null) => {
      // Cached data belongs to the previous account; never show it to the next one.
      activeGeneration.current = null;
      queryClient.clear();
      setState({ status: 'anonymous', user: null, notice });
    },
    [queryClient],
  );

  const resolveIdentity = useCallback(async () => {
    const session = tdTokens.read();
    const generation = session?.generation ?? null;
    activeGeneration.current = generation;
    // Anything that finishes after a sign-out or another sign-in must not touch state.
    const isCurrent = () => activeGeneration.current === generation && (tdTokens.read()?.generation ?? null) === generation;

    try {
      if (session && nearExpiry(session)) await tdRefresh.refresh({ generation });
      // Without a session this rejects with `not_signed_in` before any request.
      const me = await tdApi.me({ generation });
      if (isCurrent()) setState({ status: 'authenticated', user: me, notice: null });
    } catch (error) {
      if (!isCurrent()) return;
      if (!(error instanceof TdApiError)) {
        setState((previous) => ({ ...previous, status: 'unavailable' }));
      } else if (error.code === 'not_signed_in') {
        becomeAnonymous(null);
      } else if (error.status === 401 || error.status === 403) {
        if (generation) tdTokens.clear(generation);
        becomeAnonymous(error.status === 403 ? NO_ACCESS : SESSION_ENDED);
      } else if (error.code !== SESSION_CHANGED) {
        setState((previous) => ({ ...previous, status: 'unavailable' }));
      }
    }
  }, [becomeAnonymous]);

  useEffect(() => {
    void resolveIdentity();
  }, [resolveIdentity]);

  // A sign-out, a refused refresh, or a sign-in in another tab.
  useEffect(
    () =>
      tdTokens.subscribe(() => {
        const stored = tdTokens.read()?.generation ?? null;
        if (stored === activeGeneration.current) return;
        if (stored !== null && stored === endedGeneration.current) return;
        if (stored === null) {
          becomeAnonymous(SESSION_ENDED);
          return;
        }
        // Someone else's session: drop the old identity and its data before revalidating.
        activeGeneration.current = null;
        queryClient.clear();
        setState({ status: 'loading', user: null, notice: null });
        void resolveIdentity();
      }),
    [becomeAnonymous, queryClient, resolveIdentity],
  );

  useEffect(() => {
    if (state.status !== 'authenticated') return;
    const id = setInterval(() => {
      const session = tdTokens.read();
      // A terminal outcome clears the store, which the subscription above turns into a sign-out.
      if (session && nearExpiry(session)) void tdRefresh.refresh({ generation: activeGeneration.current });
    }, RENEW_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [state.status]);

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await tdApi.login(email, password);
      const generation = newGeneration();
      // Set first, so our own commit below is not mistaken for another tab's sign-in.
      activeGeneration.current = generation;
      endedGeneration.current = null;
      queryClient.clear();
      try {
        const replaced = await withSessionLock(() => {
          const previous = tdTokens.read();
          tdTokens.replace({ ...tokens, generation, staffId: null, refreshPendingSince: null });
          return previous;
        });
        if (replaced) void tdApi.logout(replaced.refreshToken);
        const me = await tdApi.me({ generation });
        const committed = await withSessionLock(() => tdTokens.update(generation, { staffId: me.id }));
        if (!committed || activeGeneration.current !== generation) {
          throw new TdApiError(0, SESSION_CHANGED, 'Another sign-in replaced this one');
        }
        setState({ status: 'authenticated', user: me, notice: null });
        return me;
      } catch (error) {
        if (activeGeneration.current === generation) {
          tdTokens.clear(generation);
          becomeAnonymous(null);
        }
        throw error;
      }
    },
    [becomeAnonymous, queryClient],
  );

  const logout = useCallback(async () => {
    const session = tdTokens.read();
    endedGeneration.current = session?.generation ?? null;
    // The UI and cached data go now; the storage commit may wait for an in-flight refresh.
    becomeAnonymous(null);
    if (!session) return;
    const revoke = tdApi.logout(session.refreshToken);
    try {
      await withSessionLock(() => tdTokens.clear(session.generation));
    } catch {
      // Lock wait timed out behind a stuck refresh: clearing this generation anyway is still safe.
      tdTokens.clear(session.generation);
    }
    if (endedGeneration.current === session.generation) endedGeneration.current = null;
    await revoke;
  }, [becomeAnonymous]);

  const retry = useCallback(() => {
    setState((previous) => ({ ...previous, status: 'loading' }));
    void resolveIdentity();
  }, [resolveIdentity]);

  const value = useMemo<TdAuthContextValue>(() => ({ ...state, login, logout, retry }), [state, login, logout, retry]);

  return <TdAuthContext.Provider value={value}>{children}</TdAuthContext.Provider>;
}
