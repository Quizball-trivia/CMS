// Imported by next.config.ts, so relative imports only (no `@/` alias there).
import { resolveWorkspace } from '../workspace';

export type TdDeployEnv = 'production' | 'staging' | 'local';

export interface TdEnvInput {
  [name: string]: string | undefined;
  NEXT_PUBLIC_CMS_WORKSPACE?: string;
  NEXT_PUBLIC_CMS_ENV?: string;
  NEXT_PUBLIC_TD_API_URL?: string;
  NEXT_PUBLIC_TD_API_MOCK?: string;
  /** Set to "1" by Vercel on every build it hosts. */
  VERCEL?: string;
}

export interface TdConfig {
  deployEnv: TdDeployEnv;
  apiUrl: string;
  /** Origin the browser may connect to besides 'self'; null when mocked. */
  apiOrigin: string | null;
  mock: boolean;
}

const INERT: TdConfig = { deployEnv: 'local', apiUrl: '', apiOrigin: null, mock: false };
const MOCK_API_URL = 'https://td-api.mock';

/** Only the exact strings "1" and "0" (or unset) are accepted, so build and client can never disagree. */
function parseFlag(name: string, raw: string | undefined): boolean {
  if (raw === undefined || raw === '' || raw === '0') return false;
  if (raw === '1') return true;
  throw new Error(`${name} must be "1", "0" or unset, got "${raw}"`);
}

/** The product environment; Vercel's own environment says nothing about it (staging has a production slot too). */
function resolveDeployEnv(env: TdEnvInput): TdDeployEnv {
  const raw = env.NEXT_PUBLIC_CMS_ENV;
  if (raw === 'PROD') return 'production';
  if (raw === 'STAGING') return 'staging';
  if (raw === undefined || raw === '') {
    if (env.VERCEL === '1') throw new Error('Hosted Table Derby CMS builds must set NEXT_PUBLIC_CMS_ENV to PROD or STAGING');
    return 'local';
  }
  throw new Error(`NEXT_PUBLIC_CMS_ENV must be PROD or STAGING, got "${raw}"`);
}

/**
 * Validates the Table Derby build configuration. Inert in the Quizball
 * workspace so a Quizball build never depends on TD variables.
 */
export function resolveTdConfig(env: TdEnvInput): TdConfig {
  if (resolveWorkspace(env.NEXT_PUBLIC_CMS_WORKSPACE) !== 'table-derby') return INERT;

  const deployEnv = resolveDeployEnv(env);
  const mock = parseFlag('NEXT_PUBLIC_TD_API_MOCK', env.NEXT_PUBLIC_TD_API_MOCK);

  if (mock) {
    if (deployEnv === 'production') {
      throw new Error('NEXT_PUBLIC_TD_API_MOCK=1 is not allowed when NEXT_PUBLIC_CMS_ENV=PROD');
    }
    return { deployEnv, apiUrl: MOCK_API_URL, apiOrigin: null, mock };
  }

  const raw = env.NEXT_PUBLIC_TD_API_URL?.trim() ?? '';
  if (!raw) {
    throw new Error('Table Derby CMS needs NEXT_PUBLIC_TD_API_URL (or NEXT_PUBLIC_TD_API_MOCK=1 outside production)');
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`NEXT_PUBLIC_TD_API_URL is not a valid URL: "${raw}"`);
  }
  if (url.protocol !== 'https:' && !(deployEnv === 'local' && url.protocol === 'http:')) {
    throw new Error('NEXT_PUBLIC_TD_API_URL must be https outside local development');
  }
  return { deployEnv, apiUrl: raw.replace(/\/+$/, ''), apiOrigin: url.origin, mock };
}

/**
 * Plan §13.4: the TD CMS may only talk to itself and the TD API. Staff tokens
 * live in localStorage (shared across tabs), so the policy also keeps other
 * sources out: no foreign scripts, images, frames or plugins, no framing of
 * the CMS, and no `<base>` or form redirection. Next's inline bootstrap
 * scripts still need 'unsafe-inline' until per-request nonces are added.
 */
export function tdContentSecurityPolicy(config: TdConfig): string {
  const dev = config.deployEnv === 'local';
  const directives: string[][] = [
    ["default-src", "'self'"],
    ["script-src", "'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", 'data:', 'blob:'],
    ["font-src", "'self'", 'data:'],
    ["connect-src", "'self'", ...(config.apiOrigin ? [config.apiOrigin] : []), ...(dev ? ['ws:'] : [])],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
  ];
  return directives.map((d) => d.join(' ')).join('; ');
}
