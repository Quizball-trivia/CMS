'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { isTableDerbyPath } from '@/lib/workspace-guard';
import { Providers } from './index';

/**
 * Root providers in a Table Derby build. Quizball pages are still compiled and
 * prerendered there (src/proxy.ts 404s them at runtime), so they keep their
 * providers; /td pages never mount Quizball auth and bring their own.
 */
export function TableDerbyRoot({ children }: { children: ReactNode }) {
  return isTableDerbyPath(usePathname() ?? '') ? children : <Providers>{children}</Providers>;
}
