'use client';

import { useEffect, useState } from 'react';

/** The current time, re-read every `intervalMs` (re-renders the caller). */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
