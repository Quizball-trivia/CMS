import type { Metadata } from 'next';
import { TdTabPage } from '@/components/td/td-page';
import { TdClubsTab } from '@/components/td/tabs/library-tabs';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('clubs').label };

export default function Page() {
  return (
    <TdTabPage tab="clubs">
      <TdClubsTab />
    </TdTabPage>
  );
}
