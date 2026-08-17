import { AlertTriangle, ShieldCheck } from 'lucide-react';

type CmsEnv = 'PROD' | 'STAGING';

const CONFIG: Record<
  CmsEnv,
  { label: string; className: string; Icon: typeof AlertTriangle }
> = {
  PROD: {
    label: 'PROD — live players',
    className: 'bg-red-600 text-white',
    Icon: AlertTriangle,
  },
  STAGING: {
    label: 'STAGING — safe sandbox',
    className: 'bg-emerald-600 text-white',
    Icon: ShieldCheck,
  },
};

function resolveEnv(): CmsEnv | null {
  const raw = process.env.NEXT_PUBLIC_CMS_ENV?.trim().toUpperCase();
  if (raw === 'PROD' || raw === 'STAGING') return raw;
  return null;
}

export function EnvironmentBanner() {
  const env = resolveEnv();
  if (!env) return null;

  const { label, className, Icon } = CONFIG[env];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-0 z-[200] flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold tracking-wide ${className}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{label}</span>
    </div>
  );
}
