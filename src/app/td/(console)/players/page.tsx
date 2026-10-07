import type { Metadata } from 'next';
import { TdTabPage } from '@/components/td/td-page';
import { TdPlayersTab } from '@/components/td/tabs/players-tab';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('players').label };

export default function TdPlayersPage() {
  return (
    <TdTabPage tab="players">
      <TdPlayersTab />
    </TdTabPage>
  );
}
