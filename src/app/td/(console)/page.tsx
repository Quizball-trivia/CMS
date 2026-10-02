import type { Metadata } from 'next';
import { TdDashboard } from '@/components/td/td-dashboard';
import { TdTabPage } from '@/components/td/td-page';
import { t } from '@/lib/td/i18n';

export const metadata: Metadata = { title: t('Dashboard') };

export default function TdDashboardPage() {
  return (
    <TdTabPage tab="dashboard">
      <TdDashboard />
    </TdTabPage>
  );
}
