// Imported by next.config.ts, so relative imports only (no `@/` alias there).
import { resolveWorkspace } from '../workspace';

export type TdDeployEnv = 'production' | 'staging' | 'local';

export interface TdEnvInput {
  [name: string]: string | undefined;
  NEXT_PUBLIC_CMS_WORKSPACE?: string;
  NEXT_PUBLIC_CMS_ENV?: string;
  NEXT_PUBLIC_VERCEL_ENV?: string;
  VERCEL_ENV?: string;
  NEXT_PUBLIC_TD_API_URL?: string;
  NEXT_PUBLIC_TD_API_MOCK?: string;
}

export interface TdConfig {
  deployEnv: TdDeployEnv;
  apiUrl: string;
  mock: boolean;
}

const INERT: TdConfig = { deployEnv: 'local', apiUrl: '', mock: false };

function resolveDeployEnv(env: TdEnvInput): TdDeployEnv {
  const cmsEnv = env.NEXT_PUBLIC_CMS_ENV?.trim().toUpperCase();
  if (cmsEnv === 'PROD') return 'production';
  if (cmsEnv === 'STAGING') return 'staging';
  return 'local';
}

/**
 * Validates the Table Derby build configuration. Inert in the Quizball
 * workspace so a Quizball build never depends on TD variables.
 */
export function resolveTdConfig(env: TdEnvInput): TdConfig {
  if (resolveWorkspace(env.NEXT_PUBLIC_CMS_WORKSPACE) !== 'table-derby') return INERT;

  const deployEnv = resolveDeployEnv(env);
  const mock = env.NEXT_PUBLIC_TD_API_MOCK?.trim() === '1';
  const vercelEnv = (env.VERCEL_ENV ?? env.NEXT_PUBLIC_VERCEL_ENV)?.trim();

  if (mock) {
    // Any Vercel production deployment counts, in case NEXT_PUBLIC_CMS_ENV is missing there.
    if (deployEnv === 'production' || vercelEnv === 'production') {
      throw new Error('NEXT_PUBLIC_TD_API_MOCK=1 is not allowed in a production Table Derby CMS build');
    }
    return { deployEnv, apiUrl: 'https://td-api.mock', mock };
  }

  const apiUrl = env.NEXT_PUBLIC_TD_API_URL?.trim().replace(/\/+$/, '') ?? '';
  if (!apiUrl) {
    throw new Error('Table Derby CMS needs NEXT_PUBLIC_TD_API_URL (or NEXT_PUBLIC_TD_API_MOCK=1 outside production)');
  }
  if (deployEnv === 'production' && !apiUrl.startsWith('https://')) {
    throw new Error('NEXT_PUBLIC_TD_API_URL must be https in production');
  }
  return { deployEnv, apiUrl, mock };
}
