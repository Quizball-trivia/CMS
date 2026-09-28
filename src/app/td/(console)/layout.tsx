'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { TdShell } from '@/components/td/td-shell';
import { TdAccessDenied, TdFullScreenLoader, TdUnavailable } from '@/components/td/td-status-screens';
import { canAccessTab, tabForPath } from '@/lib/td/navigation';
import { TD_ROOT } from '@/lib/workspace-guard';
import { useTdAuth } from '@/providers/td-auth-provider';

export default function TdConsoleLayout({ children }: { children: ReactNode }) {
  const { status, user, retry } = useTdAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status !== 'anonymous') return;
    const next = pathname && pathname !== TD_ROOT ? `?next=${encodeURIComponent(pathname)}` : '';
    router.replace(`${TD_ROOT}/login${next}`);
  }, [status, pathname, router]);

  if (status === 'unavailable') return <TdUnavailable onRetry={retry} />;
  if (status !== 'authenticated' || !user) return <TdFullScreenLoader />;

  // UX only: the API enforces the same roles on every request, reads included.
  const tab = tabForPath(pathname);
  const allowed = !tab || canAccessTab(tab, user.role);

  return <TdShell user={user}>{allowed ? children : <TdAccessDenied />}</TdShell>;
}
