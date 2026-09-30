import type { Metadata } from 'next';
import { TdTabPage } from '@/components/td/td-page';
import { TdWhoamiTab } from '@/components/td/tabs/rounds-tabs';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('round-2').label };

export default function Page() {
  return (
    <TdTabPage tab="round-2">
      <TdWhoamiTab />
    </TdTabPage>
  );
}
