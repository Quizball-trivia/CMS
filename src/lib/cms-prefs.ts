// Per-browser CMS preferences. The real-data pages (Analytics (live), Persons)
// are HIDDEN by default so a screen-share or investor demo can never stumble
// from the demo-scaled /stats page into production truth. The switch lives on
// the Settings page and only affects this browser.
const REAL_ANALYTICS_KEY = 'cms_real_analytics_visible';
const CHANGE_EVENT = 'cms-prefs-changed';

export function isRealAnalyticsVisible(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(REAL_ANALYTICS_KEY) === '1';
}

export function setRealAnalyticsVisible(visible: boolean): void {
  window.localStorage.setItem(REAL_ANALYTICS_KEY, visible ? '1' : '0');
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeToPrefs(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}
