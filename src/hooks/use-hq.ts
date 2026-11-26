import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { hqApi } from '@/lib/hq-api';

// What is left of the old HQ data layer: the product analytics (players,
// growth, retention, website) and a shared clock. The agent side of HQ lives
// in use-harness.ts.

export const hqKeys = {
  all: ['hq'] as const,
  analytics: (days: number) => [...hqKeys.all, 'analytics', days] as const,
  posthog: (days: number) => [...hqKeys.all, 'posthog', days] as const,
};

export function useHqAnalytics(days: number) {
  return useQuery({
    queryKey: hqKeys.analytics(days),
    queryFn: () => hqApi.analytics(days),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useHqPosthog(days: number) {
  return useQuery({
    queryKey: hqKeys.posthog(days),
    queryFn: () => hqApi.posthog(days),
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * A clock for time-dependent labels ("used up until", "today") that advances
 * while the page stays open, e.g. across Tbilisi midnight.
 */
export function useHqClock(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
