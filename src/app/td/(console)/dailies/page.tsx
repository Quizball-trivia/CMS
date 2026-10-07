import type { Metadata } from 'next';
import { TdTabPage } from '@/components/td/td-page';
import { TdDailiesTab } from '@/components/td/tabs/dailies-tab';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('dailies').label };

export default function TdDailiesPage() {
  return (
    <TdTabPage tab="dailies">
      <TdDailiesTab />
    </TdTabPage>
  );
}
