'use client';

import { useSyncExternalStore } from 'react';
import { georgiaToday, subscribeGeorgiaDay } from '@/lib/td/georgia';

/** Today's Georgian date, moving on at Georgian midnight; null while prerendering, so a page never carries its build date. */
export function useGeorgiaToday(): string | null {
  return useSyncExternalStore(subscribeGeorgiaDay, () => georgiaToday(), () => null);
}
