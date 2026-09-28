import { FlaskConical } from 'lucide-react';
import { TD_CONFIG } from '@/lib/td/client';
import type { TdDeployEnv } from '@/lib/td/env';
import { cn } from '@/lib/utils';

const ENV_STYLES: Record<TdDeployEnv, { label: string; className: string }> = {
  production: { label: 'Production', className: 'border-(--td-danger)/50 bg-(--td-danger)/15 text-(--td-danger)' },
  staging: { label: 'Staging', className: 'border-(--td-new)/50 bg-(--td-new)/15 text-(--td-new)' },
  local: { label: 'Local', className: 'border-border bg-secondary text-(--td-text-2)' },
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
          title="Data comes from the in-browser mock API, not the Table Derby API"
          className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300"
        >
          <FlaskConical className="size-3" />
          Mock API
        </span>
      )}
    </div>
  );
}
