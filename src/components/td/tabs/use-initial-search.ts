import { useState } from 'react';

/** `?q=` of the page's URL, read once (links from the release report land on the row they name). */
export function useInitialSearch(): string {
  const [q] = useState(() => (typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get('q') ?? '')));
  return q;
}
