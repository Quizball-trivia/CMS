/**
 * One-time link tokens ride in the URL fragment (`#token=…`), which never reaches a server. This script runs
 * before the App Router hydrates, reads the token, keeps it for the page and clears the fragment, so the router
 * never takes up a URL with the token in it (it reads `location.href` once, when it starts).
 */

export const TD_LINK_PATHS = { invite: '/td/accept-invite', reset: '/td/reset' } as const;

export interface TdEarlyLinkToken {
  path: string;
  token: string | null;
}

declare global {
  interface Window {
    __tdLinkToken?: TdEarlyLinkToken;
  }
}

export const LINK_FRAGMENT_SCRIPT = `(function(){try{var p=location.pathname;if((p!==${JSON.stringify(TD_LINK_PATHS.invite)}&&p!==${JSON.stringify(TD_LINK_PATHS.reset)})||!location.hash)return;window.__tdLinkToken={path:p,token:new URLSearchParams(location.hash.slice(1)).get('token')};history.replaceState(null,'',p+location.search);}catch(e){}})();`;
