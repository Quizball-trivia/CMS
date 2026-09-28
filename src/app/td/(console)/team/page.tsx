import type { Metadata } from 'next';
import { TdPageHeader } from '@/components/td/td-page';
import { TdTeam } from '@/components/td/td-team';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('team').label };

export default function TdTeamPage() {
  return (
    <>
      <TdPageHeader tabKey="team" />
      <TdTeam />
    </>
  );
}
