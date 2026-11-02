'use client';

import { Suspense, type ReactNode } from 'react';
import { TaskSheetHost } from './task-sheet';

// Navigation for HQ lives in the sidebar (Company + Departments); each page
// renders its own PageHeader. The layout only hosts the shared task sheet.
export default function HqLayout({ children }: { children: ReactNode }) {
  return (
    // useSearchParams (task sheet) needs a Suspense boundary for static rendering.
    <Suspense fallback={null}>
      <div className="space-y-6">{children}</div>
      <TaskSheetHost />
    </Suspense>
  );
}
