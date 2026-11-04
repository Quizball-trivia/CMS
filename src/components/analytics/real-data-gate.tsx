'use client';

import Link from 'next/link';
import { useRealAnalyticsVisible } from '@/hooks/use-real-analytics-visible';

/** Wraps the real-data pages: when hidden (the default), direct URLs show a
 *  neutral notice instead of production numbers — demo-safe by construction. */
export function RealDataGate({ children }: { children: React.ReactNode }) {
  const visible = useRealAnalyticsVisible();
  if (!visible) {
    return (
      <div className="p-8 text-sm text-slate-500">
        Real-data pages are hidden in this browser. Enable them in{' '}
        <Link href="/settings" className="font-medium text-blue-600 underline">Settings → Preferences</Link>.
      </div>
    );
  }
  return <>{children}</>;
}
