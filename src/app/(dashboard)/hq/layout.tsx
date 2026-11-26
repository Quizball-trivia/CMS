'use client';

import { Suspense, type ReactNode } from 'react';

// Navigation for HQ lives in the sidebar; each page renders its own PageHeader.
export default function HqLayout({ children }: { children: ReactNode }) {
  return (
    // Pages read the address (tabs live in it), which needs a Suspense boundary for static rendering.
    <Suspense fallback={null}>
      <div className="space-y-6">{children}</div>
    </Suspense>
  );
}
