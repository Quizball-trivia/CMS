'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SESSION_CHANGED, TdApiError } from '@/lib/td/api-client';
import { tdApi, tdRefresh, tdTokens } from '@/lib/td/client';
import { newGeneration, type TdSession, type TdTokenSet } from '@/lib/td/token-store';
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
  /** Null when the link was taken but the session could not be: the password is set, sign in with it. */
  acceptInvite(token: string, password: string, name: string): Promise<TdStaff | null>;
  resetPassword(token: string, password: string): Promise<TdStaff | null>;
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

/**
 * Ends one sign-in: the cancellation takes effect at once in every tab without
 * waiting for the lock, then the stored copy is removed under it. If that
 * clean-up never gets the lock, the cancelled session still reads as gone.
 */
async function endGeneration(generation: string): Promise<void> {
  tdTokens.cancel(generation);
  await tdTokens.transact((tx) => tx.clear(generation)).catch(() => undefined);
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
      // A reload between a sign-in and its commit of the member's id leaves the session without it; actions
      // check that id before they go out, so it is recorded here before anything is shown.
      if (generation && tdTokens.read()?.staffId !== me.id) await tdTokens.transact((tx) => tx.update(generation, { staffId: me.id }));
      if (isCurrent()) setState({ status: 'authenticated', user: me, notice: null });
    } catch (error) {
      if (!isCurrent()) return;
      if (!(error instanceof TdApiError)) {
        setState((previous) => ({ ...previous, status: 'unavailable' }));
      } else if (error.code === 'not_signed_in') {
        becomeAnonymous(null);
      } else if (error.status === 401 || error.status === 403) {
        becomeAnonymous(error.status === 403 ? NO_ACCESS : SESSION_ENDED);
        if (generation) await endGeneration(generation);
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

  /**
   * Makes a session the API just issued this tab's sign-in, replacing (and revoking) the stored one. With
   * `expected`, only if the stored sign-in is still that one when the replacement runs under the session lock;
   * otherwise it is left alone, the unused new session is revoked, and this answers null.
   */
  const adopt = useCallback(
    async (tokens: TdTokenSet, expected?: string | null): Promise<TdStaff | null> => {
      const generation = newGeneration();
      // Set first, so our own commit below is not mistaken for another tab's sign-in.
      activeGeneration.current = generation;
      queryClient.clear();
      // No identity shown while the credentials change hands: the old account's name and role never sit over the new tokens.
      setState({ status: 'loading', user: null, notice: null });
      let taken = false;
      try {
        const outcome = await tdTokens.transact((tx) => {
          const previous = tx.read();
          if (expected !== undefined && (previous?.generation ?? null) !== expected) return { stale: true as const };
          tx.replace({ ...tokens, generation, staffId: null, refreshPendingSince: null });
          return { stale: false as const, previous };
        });
        if (outcome.stale) {
          void tdApi.logout(tokens.refreshToken);
          // Show the sign-in that came first again, as it stands in the store.
          void resolveIdentity();
          return null;
        }
        taken = true;
        if (outcome.previous) void tdApi.logout(outcome.previous.refreshToken);
        const me = await tdApi.me({ generation });
        const committed = await tdTokens.transact((tx) => tx.update(generation, { staffId: me.id }));
        if (!committed || activeGeneration.current !== generation) {
          throw new TdApiError(0, SESSION_CHANGED, 'Another sign-in replaced this one');
        }
        setState({ status: 'authenticated', user: me, notice: null });
        return me;
      } catch (error) {
        if (!taken) void tdApi.logout(tokens.refreshToken);
        if (activeGeneration.current === generation) becomeAnonymous(null);
        await endGeneration(generation);
        throw error;
      }
    },
    [becomeAnonymous, queryClient, resolveIdentity],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const member = await adopt(await tdApi.login(email, password));
      if (!member) throw new TdApiError(0, SESSION_CHANGED, 'Another sign-in replaced this one');
      return member;
    },
    [adopt],
  );

  /**
   * A one-time link redeemed: refused links and passwords throw; once the API has taken it the password is set,
   * so a session that then cannot be taken up answers null (sign in with the new password) rather than an error.
   */
  const redeem = useCallback(
    async (obtain: () => Promise<TdTokenSet | null>) => {
      // The sign-in this began under: another sign-in or a sign-out meanwhile is left alone (checked again under the lock).
      const before = tdTokens.read()?.generation ?? null;
      const tokens = await obtain();
      if (!tokens) return null;
      try {
        return await adopt(tokens, before);
      } catch {
        return null;
      }
    },
    [adopt],
  );
  const acceptInvite = useCallback((token: string, password: string, name: string) => redeem(() => tdApi.acceptInvite(token, password, name)), [redeem]);
  const resetPassword = useCallback((token: string, password: string) => redeem(() => tdApi.resetPassword(token, password)), [redeem]);

  const logout = useCallback(async () => {
    const session = tdTokens.read();
    becomeAnonymous(null);
    if (!session) return;
    const revoke = tdApi.logout(session.refreshToken);
    await endGeneration(session.generation);
    await revoke;
  }, [becomeAnonymous]);

  const retry = useCallback(() => {
    setState((previous) => ({ ...previous, status: 'loading' }));
    void resolveIdentity();
  }, [resolveIdentity]);

  const value = useMemo<TdAuthContextValue>(() => ({ ...state, login, acceptInvite, resetPassword, logout, retry }), [state, login, acceptInvite, resetPassword, logout, retry]);

  return <TdAuthContext.Provider value={value}>{children}</TdAuthContext.Provider>;
}
