import type { Metadata } from 'next';
import { TdPageHeader, TdSection } from '@/components/td/td-page';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('settings').label };

const SETTINGS = [
  { label: 'Tickets per day', help: 'Ranked tickets each player gets per day.' },
  { label: 'Bot fallback delay', help: 'How long a player waits in the queue before a bot is offered.' },
  { label: 'Bot difficulty', help: 'How strong fallback bots play.' },
  { label: 'Maintenance mode', help: 'Takes the game offline for players.' },
];

export default function TdSettingsPage() {
  return (
    <>
      <TdPageHeader tabKey="settings" />
      <TdSection title="Game settings" description="Read-only until the Table Derby API exposes them.">
        <ul className="divide-y divide-(--td-divider)">
          {SETTINGS.map((setting) => (
            <li key={setting.label} className="flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <p className="text-sm font-medium">{setting.label}</p>
                <p className="text-xs text-(--td-text-3)">{setting.help}</p>
              </div>
              <span className="text-sm tabular-nums text-(--td-text-3)">—</span>
            </li>
          ))}
        </ul>
      </TdSection>
    </>
  );
}
