import { useSyncExternalStore } from 'react';
import { isRealAnalyticsVisible, subscribeToPrefs } from '@/lib/cms-prefs';

export function useRealAnalyticsVisible(): boolean {
  return useSyncExternalStore(subscribeToPrefs, isRealAnalyticsVisible, () => false);
}
