'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { TdApiError } from '@/lib/td/api-client';
import { TdAuthProvider } from './td-auth-provider';

function shouldRetry(failureCount: number, error: unknown): boolean {
  // 4xx answers (refused, forbidden, validation) will not change on retry.
  if (error instanceof TdApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

/** Table Derby's own providers; Quizball's never mount under /td (see TableDerbyRoot). */
export function TdProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: shouldRetry },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TdAuthProvider>
        {children}
        <Toaster theme="dark" position="top-right" />
      </TdAuthProvider>
    </QueryClientProvider>
  );
}
