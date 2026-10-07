import type { Metadata } from 'next';
import { TdTabPage } from '@/components/td/td-page';
import { TdBoxTab } from '@/components/td/tabs/rounds-tabs';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('round-3').label };

export default function Page() {
  return (
    <TdTabPage tab="round-3">
      <TdBoxTab />
    </TdTabPage>
  );
}
