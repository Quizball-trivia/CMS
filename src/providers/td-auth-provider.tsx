'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TdApiError } from '@/lib/td/api-client';
import { tdApi, tdRefresh, tdTokens } from '@/lib/td/client';
import type { TdSession } from '@/lib/td/token-store';
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

function nearExpiry(session: TdSession): boolean {
  return session.expiresAt !== null && Date.now() > session.expiresAt - RENEW_BEFORE_EXPIRY_MS;
}

export function useTdAuth(): TdAuthContextValue {
  const context = useContext(TdAuthContext);
  if (!context) throw new Error('useTdAuth must be used within a TdAuthProvider');
  return context;
}

export function TdAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<TdAuthState>({ status: 'loading', user: null, notice: null });
  const userIdRef = useRef<string | null>(null);

  const endSession = useCallback(
    (notice: string | null) => {
      // Cached data belongs to the previous account; never show it to the next one.
      queryClient.clear();
      userIdRef.current = null;
      setState({ status: 'anonymous', user: null, notice });
    },
    [queryClient],
  );

  const resolveIdentity = useCallback(async () => {
    const session = tdTokens.read();
    if (session && nearExpiry(session) && (await tdRefresh.refresh()) === 'terminal') {
      endSession(SESSION_ENDED);
      return;
    }
    try {
      // Without a session this rejects with `not_signed_in` before any request.
      const me = await tdApi.me();
      if (userIdRef.current !== me.id) queryClient.clear();
      userIdRef.current = me.id;
      setState({ status: 'authenticated', user: me, notice: null });
    } catch (error) {
      if (error instanceof TdApiError && error.code === 'not_signed_in') {
        endSession(null);
        return;
      }
      if (error instanceof TdApiError && (error.status === 401 || error.status === 403)) {
        tdTokens.clear();
        endSession(error.status === 403 ? 'This account has no access to the Table Derby CMS.' : SESSION_ENDED);
        return;
      }
      setState((previous) => ({ ...previous, status: 'unavailable' }));
    }
  }, [endSession, queryClient]);

  // State is set only after an await; the rule cannot see through the async boundary.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void resolveIdentity(); }, [resolveIdentity]);

  // Logout, a refused refresh, or a sign-in as someone else, in this tab or another.
  useEffect(
    () =>
      tdTokens.subscribe((change) => {
        if (!tdTokens.read()) {
          if (userIdRef.current) endSession(SESSION_ENDED);
          return;
        }
        const storedId = tdTokens.readStaffId();
        // null means a sign-in is in progress; its staff id write arrives next.
        if (change !== 'staff' || !storedId || storedId === userIdRef.current) return;
        queryClient.clear();
        userIdRef.current = null;
        setState({ status: 'loading', user: null, notice: null });
        void resolveIdentity();
      }),
    [endSession, queryClient, resolveIdentity],
  );

  useEffect(() => {
    if (state.status !== 'authenticated') return;
    const id = setInterval(() => {
      const session = tdTokens.read();
      // A terminal outcome clears the store, which the subscription above turns into a sign-out.
      if (session && nearExpiry(session)) void tdRefresh.refresh();
    }, RENEW_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [state.status]);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await tdApi.login(email, password);
      queryClient.clear();
      userIdRef.current = null;
      tdTokens.writeStaffId(null);
      tdTokens.write(session);
      let me: TdStaff;
      try {
        me = await tdApi.me();
      } catch (error) {
        tdTokens.clear();
        throw error;
      }
      userIdRef.current = me.id;
      tdTokens.writeStaffId(me.id);
      setState({ status: 'authenticated', user: me, notice: null });
      return me;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    // The revoke request has already read the token, so the local session ends
    // now instead of waiting on the network; revoking stays best effort.
    const revoke = tdApi.logout().catch(() => undefined);
    tdTokens.clear();
    endSession(null);
    await revoke;
  }, [endSession]);

  const retry = useCallback(() => {
    setState((previous) => ({ ...previous, status: 'loading' }));
    void resolveIdentity();
  }, [resolveIdentity]);

  const value = useMemo<TdAuthContextValue>(() => ({ ...state, login, logout, retry }), [state, login, logout, retry]);

  return <TdAuthContext.Provider value={value}>{children}</TdAuthContext.Provider>;
}
