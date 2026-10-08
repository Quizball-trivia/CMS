import { AlertTriangle, FlaskConical, ShieldCheck, Wrench, type LucideIcon } from 'lucide-react';
import { TD_CONFIG } from '@/lib/td/client';
import type { TdDeployEnv } from '@/lib/td/env';
import { t } from '@/lib/td/i18n';
import { cn } from '@/lib/utils';

const ENV_STYLES: Record<TdDeployEnv, { label: string; className: string }> = {
  production: { label: t('Production'), className: 'border-(--td-danger)/50 bg-(--td-danger)/15 text-(--td-danger)' },
  staging: { label: t('Staging'), className: 'border-(--td-new)/50 bg-(--td-new)/15 text-(--td-new)' },
  local: { label: t('Local'), className: 'border-border bg-secondary text-(--td-text-2)' },
};

export function TdEnvironmentBadge({ className }: { className?: string }) {
  const env = ENV_STYLES[TD_CONFIG.deployEnv];
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span
        role="status"
        className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', env.className)}
      >
        {env.label}
      </span>
      {TD_CONFIG.mock && (
        <span
          title={t('Data comes from the in-browser mock API, not the Table Derby API')}
          className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800"
        >
          <FlaskConical className="size-3" />
          {t('Mock API')}
        </span>
      )}
    </div>
  );
}

const BANNERS: Record<TdDeployEnv, { label: string; className: string; Icon: LucideIcon }> = {
  production: { label: t('PROD — live players'), className: 'bg-red-600 text-white', Icon: AlertTriangle },
  staging: { label: t('STAGING — safe sandbox'), className: 'bg-emerald-600 text-white', Icon: ShieldCheck },
  local: { label: t('LOCAL'), className: 'bg-slate-700 text-white', Icon: Wrench },
};

/** The strip across the top, as in the Quizball CMS (layout/environment-banner.tsx); under
 *  the editor sheet and dialogs, which open over the whole window here. */
export function TdEnvironmentBanner() {
  const { label, className, Icon } = BANNERS[TD_CONFIG.deployEnv];
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('sticky top-0 z-40 flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold tracking-wide', className)}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{TD_CONFIG.mock ? t('{label} · mock API', { label }) : label}</span>
    </div>
  );
}
