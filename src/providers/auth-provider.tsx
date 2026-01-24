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

  const checkAuth = useCallback(async () => {
    try {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) {
        setIsLoading(false);
        return;
      }

      // Check if token has expired (treat invalid/NaN values as expired)
      const expiresAt = localStorage.getItem(AUTH_EXPIRY_KEY);
      if (expiresAt) {
        const expiryTime = Number(expiresAt);
        if (!Number.isFinite(expiryTime) || Date.now() > expiryTime) {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          localStorage.removeItem(REFRESH_TOKEN_KEY);
          localStorage.removeItem(AUTH_EXPIRY_KEY);
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
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = useCallback(async (data: LoginRequest): Promise<void> => {
    const response = await authService.login(data);

    // Backend returns tokens directly on the response object
    if (response.access_token) {
      localStorage.setItem(AUTH_TOKEN_KEY, response.access_token);
    }
    if (response.refresh_token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, response.refresh_token);
    }
    // Store expiry timestamp for client-side validation
    // Clear any stale expiry if not provided to avoid incorrect validation
    if (response.expires_in) {
      const expiresAt = Date.now() + response.expires_in * 1000;
      localStorage.setItem(AUTH_EXPIRY_KEY, String(expiresAt));
    } else {
      localStorage.removeItem(AUTH_EXPIRY_KEY);
    }

    // Fetch full user profile after login
    const userData = await authService.getMe();
    setUser(userData);
  }, []);

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
