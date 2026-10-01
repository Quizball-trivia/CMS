'use client';

import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TdUnsupportedBrowser } from '@/components/td/td-status-screens';
import { Toaster } from '@/components/ui/sonner';
import { SESSION_CHANGED, TdApiError } from '@/lib/td/api-client';
import { TdAuthProvider } from './td-auth-provider';

function shouldRetry(failureCount: number, error: unknown): boolean {
  // 4xx answers (refused, forbidden, validation) and cancelled requests will not change on retry.
  if (error instanceof TdApiError && (error.code === SESSION_CHANGED || (error.status >= 400 && error.status < 500))) return false;
  return failureCount < 2;
}

const noSubscription = () => () => {};
// Without Web Locks a refresh token could be spent twice across tabs, so such browsers are refused.
const hasWebLocks = () => typeof navigator !== 'undefined' && Boolean(navigator.locks);

/** Table Derby's own providers; a Table Derby build never mounts Quizball's (see the root layout). */
export function TdProviders({ children }: { children: ReactNode }) {
  const supported = useSyncExternalStore(noSubscription, hasWebLocks, () => true);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: shouldRetry },
          mutations: { retry: false },
        },
      }),
  );

  if (!supported) return <TdUnsupportedBrowser />;

  return (
    <QueryClientProvider client={queryClient}>
      <TdAuthProvider>
        {children}
        <Toaster />
      </TdAuthProvider>
    </QueryClientProvider>
  );
}
