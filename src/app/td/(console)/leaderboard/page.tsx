import type { Metadata } from 'next';
import { Camera, Download, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TD_NOT_BUILT_YET, TdPlaceholderTable, TdSection, TdTabPage } from '@/components/td/td-page';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('leaderboard').label };

export default function TdLeaderboardPage() {
  return (
    <TdTabPage
      tab="leaderboard"
      actions={
        <Button disabled className="rounded-lg">
          <Camera />
          Take snapshot
        </Button>
      }
    >
      <TdSection title="Standings">
        <TdPlaceholderTable
          columns={['Rank', 'Player', 'Rating', 'Matches', 'Wins']}
          icon={Trophy}
          emptyTitle="No standings yet"
          emptyBody={TD_NOT_BUILT_YET}
        />
      </TdSection>
      <TdSection title="Frozen snapshots" description="Snapshots are immutable; prizes are paid from them, not from live standings.">
        <TdPlaceholderTable
          columns={['Snapshot', 'Taken at (Georgia)', 'Taken by', 'Players', 'Export']}
          icon={Download}
          emptyTitle="No snapshots yet"
        />
      </TdSection>
    </TdTabPage>
  );
}
