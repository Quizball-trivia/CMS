'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, CalendarPlus, Gauge, History, Upload } from 'lucide-react';
import { WlUploadPanel } from '@/components/weekend-league/wl-upload-panel';
import { WlLineupPanel } from '@/components/weekend-league/wl-lineup-panel';
import { WlNextEvent } from '@/components/weekend-league/wl-next-event';
import { WlRunway } from '@/components/weekend-league/wl-runway';
import { WlBatches } from '@/components/weekend-league/wl-batches';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Tab = 'lineup' | 'upload' | 'next' | 'runway' | 'batches';

const TABS: Array<{ key: Tab; label: string; icon: typeof Upload; hint: string }> = [
  { key: 'lineup', label: 'Upload lineup', icon: CalendarPlus, hint: 'One file for chosen games of a weekend → preview → save exact places' },
  { key: 'upload', label: 'Add to pool', icon: Upload, hint: 'One round type per file → check → publish to the pool' },
  { key: 'next', label: 'Next weekend', icon: CalendarDays, hint: 'What will be dealt, game by game' },
  { key: 'runway', label: 'Runway', icon: Gauge, hint: 'How many events the pool still covers' },
  { key: 'batches', label: 'Batches', icon: History, hint: 'Past uploads, undo' },
];

export default function WeekendLeagueContentPage() {
  const [tab, setTab] = useState<Tab>('lineup');
  const [nextEventId, setNextEventId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/weekend-league" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Weekend League
          </Link>
          <h1 className="text-2xl font-bold">Weekend League content</h1>
          <p className="text-sm text-muted-foreground">
            Questions uploaded here go into the protected WL pool only — never into ranked or daily play. Georgian is generated on publish; review it in Questions afterwards.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-3">
        {TABS.map((t) => (
          <Button key={t.key} variant={tab === t.key ? 'default' : 'outline'} size="sm" onClick={() => setTab(t.key)} title={t.hint}>
            <t.icon className={cn('mr-1.5 h-3.5 w-3.5')} /> {t.label}
          </Button>
        ))}
      </div>

      {tab === 'lineup' && <WlLineupPanel onSaved={bump} onOpenNext={(id) => { setNextEventId(id); bump(); setTab('next'); }} onOpenBatches={() => { bump(); setTab('batches'); }} />}
      {tab === 'upload' && <WlUploadPanel onPublished={bump} onOpenBatches={() => { bump(); setTab('batches'); }} />}
      {tab === 'next' && <WlNextEvent key={nextEventId ?? 'next'} refreshKey={refreshKey} eventId={nextEventId} />}
      {tab === 'runway' && <WlRunway refreshKey={refreshKey} />}
      {tab === 'batches' && <WlBatches refreshKey={refreshKey} onChanged={bump} />}
    </div>
  );
}
