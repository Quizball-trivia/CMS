'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/services';
import { AUTH_TOKEN_KEY, REFRESH_TOKEN_KEY, AUTH_EXPIRY_KEY } from '@/lib/constants';
import { logger } from '@/lib/logger';
import type { User, LoginRequest } from '@/types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (data: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const storeSession = useCallback((response: { access_token?: string | null; refresh_token?: string | null; expires_in?: number | null }) => {
    if (response.access_token) localStorage.setItem(AUTH_TOKEN_KEY, response.access_token);
    if (response.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, response.refresh_token);
    if (response.expires_in) {
      localStorage.setItem(AUTH_EXPIRY_KEY, String(Date.now() + response.expires_in * 1000));
    }
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(AUTH_EXPIRY_KEY);
  }, []);

  // Silent renewal: Supabase access tokens die at 1h — without this, every
  // CMS action starts failing mid-session (the Saturday event-ops killer).
  // Returns 'ok' | 'terminal' | 'transient'; the ROTATED token set is only
  // committed when complete (Supabase always rotates all three fields — a
  // partial response is treated as failure rather than half-stored).
  // A localStorage mutex keeps a second tab from racing the single-use
  // refresh token (reuse detection would kill both sessions otherwise).
  const refreshSession = useCallback(async (): Promise<'ok' | 'terminal' | 'transient'> => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return 'terminal';
    const LOCK_KEY = 'quizball_refresh_lock';
    const lock = Number(localStorage.getItem(LOCK_KEY) ?? '0');
    if (Number.isFinite(lock) && Date.now() - lock < 30_000) return 'transient';
    localStorage.setItem(LOCK_KEY, String(Date.now()));
    try {
      const response = await authService.refresh(refreshToken);
      if (!response.access_token || !response.refresh_token || !response.expires_in) {
        return 'transient';
      }
      storeSession(response);
      return 'ok';
    } catch (e) {
      const status = (e as { status?: number }).status;
      return status != null && status >= 400 && status < 500 ? 'terminal' : 'transient';
    } finally {
      localStorage.removeItem(LOCK_KEY);
    }
  }, [storeSession]);

  const checkAuth = useCallback(async () => {
    try {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) {
        setIsLoading(false);
        return;
      }

      // Expired or expiring soon → try the refresh token BEFORE giving up.
      const expiresAt = localStorage.getItem(AUTH_EXPIRY_KEY);
      if (expiresAt) {
        const expiryTime = Number(expiresAt);
        const nearExpiry = !Number.isFinite(expiryTime) || Date.now() > expiryTime - 5 * 60_000;
        if (nearExpiry && (await refreshSession()) === 'terminal') {
          clearSession();
          setIsLoading(false);
          return;
        }
      }

      const userData = await authService.getMe();
      setUser(userData);
    } catch {
      // Token invalid or expired
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(AUTH_EXPIRY_KEY);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [refreshSession, clearSession]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Proactive renewal loop: check every minute, refresh once inside the
  // final 5 minutes of validity. Cheap, drift-proof, and survives laptop
  // sleep (the next tick refreshes immediately if the window was crossed).
  useEffect(() => {
    if (user == null) return;
    const id = setInterval(() => {
      const raw = localStorage.getItem(AUTH_EXPIRY_KEY);
      if (raw == null) return; // no expiry known — nothing to renew against
      const expiresAt = Number(raw);
      if (!Number.isFinite(expiresAt)) return;
      if (Date.now() > expiresAt - 5 * 60_000) {
        void refreshSession().then((result) => {
          // Terminal rejection = the session is genuinely dead: clear and
          // route to login instead of silently retrying forever.
          if (result === 'terminal') {
            window.dispatchEvent(new Event('auth:session-expired'));
          }
        });
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [user, refreshSession]);

  // Listen for session expiry events from API client
  useEffect(() => {
    const handleSessionExpired = () => {
      logger.info('auth', 'Session expired event received, logging out');
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(AUTH_EXPIRY_KEY);
      setUser(null);
      router.push('/login');
    };

    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('auth:session-expired', handleSessionExpired);
    };
  }, [router]);

  const login = useCallback(async (data: LoginRequest): Promise<void> => {
    const response = await authService.login(data);

    // Backend returns tokens directly on the response object
    storeSession(response);
    if (!response.expires_in) localStorage.removeItem(AUTH_EXPIRY_KEY);

    // Fetch full user profile after login
    const userData = await authService.getMe();
    setUser(userData);
  }, [storeSession]);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Ignore logout errors
    } finally {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(AUTH_EXPIRY_KEY);
      setUser(null);
      router.push('/login');
    }
  }, [router]);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
