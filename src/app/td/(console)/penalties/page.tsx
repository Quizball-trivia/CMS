import type { Metadata } from 'next';
import { TdTabPage } from '@/components/td/td-page';
import { TdPenaltiesTab } from '@/components/td/tabs/rounds-tabs';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('penalties').label };

export default function Page() {
  return (
    <TdTabPage tab="penalties">
      <TdPenaltiesTab />
    </TdTabPage>
  );
}
