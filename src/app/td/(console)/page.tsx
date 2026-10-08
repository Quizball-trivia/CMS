import type { Metadata } from 'next';
import { TdDashboard } from '@/components/td/td-dashboard';
import { TdTabGate } from '@/components/td/td-tab-gate';
import { t } from '@/lib/td/i18n';

export const metadata: Metadata = { title: t('Dashboard') };

export default function TdDashboardPage() {
  return (
    <TdTabGate tab="dashboard">
      <TdDashboard />
    </TdTabGate>
  );
}
