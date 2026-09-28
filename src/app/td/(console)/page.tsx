import type { Metadata } from 'next';
import { TdDashboard } from '@/components/td/td-dashboard';
import { TdTabPage } from '@/components/td/td-page';

export const metadata: Metadata = { title: 'Dashboard' };

export default function TdDashboardPage() {
  return (
    <TdTabPage tab="dashboard">
      <TdDashboard />
    </TdTabPage>
  );
}
