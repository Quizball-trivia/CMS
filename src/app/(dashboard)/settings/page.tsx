'use client';

import { Eye, EyeOff, MonitorSmartphone } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRealAnalyticsVisible } from '@/hooks/use-real-analytics-visible';
import { setRealAnalyticsVisible } from '@/lib/cms-prefs';

export default function SettingsPage() {
  const visible = useRealAnalyticsVisible();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Preferences for this browser only.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MonitorSmartphone className="h-4 w-4 text-slate-400" />
            Real-data pages
          </CardTitle>
          <CardDescription>
            Shows or hides <span className="font-medium">Analytics (live)</span> and{' '}
            <span className="font-medium">Persons</span> in the sidebar. Hidden by default so a
            demo or screen-share never lands on production truth next to the demo dashboard.
            The demo <span className="font-medium">/stats</span> page is unaffected.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="text-sm text-slate-700">
            Real analytics pages are currently{' '}
            <span className={visible ? 'font-semibold text-emerald-700' : 'font-semibold text-slate-500'}>
              {visible ? 'visible' : 'hidden'}
            </span>{' '}
            in this browser.
          </div>
          <Button variant={visible ? 'outline' : 'default'} onClick={() => setRealAnalyticsVisible(!visible)}>
            {visible ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
            {visible ? 'Hide real-data pages' : 'Show real-data pages'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
