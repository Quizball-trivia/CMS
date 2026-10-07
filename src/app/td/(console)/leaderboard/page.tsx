import type { Metadata } from 'next';
import { TdTabPage } from '@/components/td/td-page';
import { TdLeaderboardTab } from '@/components/td/tabs/ops-tabs';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('leaderboard').label };

export default function Page() {
  return (
    <TdTabPage tab="leaderboard">
      <TdLeaderboardTab />
    </TdTabPage>
  );
}
