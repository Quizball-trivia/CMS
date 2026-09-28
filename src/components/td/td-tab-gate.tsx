'use client';

import type { ReactNode } from 'react';
import { canAccessTab, getTab, type TdTabKey } from '@/lib/td/navigation';
import { useTdAuth } from '@/providers/td-auth-provider';
import { TdAccessDenied } from './td-status-screens';

/** Every console page names its own tab; the role check uses that, never the URL. UX only: the API enforces roles too. */
export function TdTabGate({ tab, children }: { tab: TdTabKey; children: ReactNode }) {
  const { user } = useTdAuth();
  if (!user || !canAccessTab(getTab(tab), user.role)) return <TdAccessDenied />;
  return <>{children}</>;
}
