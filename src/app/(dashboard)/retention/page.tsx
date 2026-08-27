'use client';

import {
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FlaskConical,
  Loader2,
  LockKeyhole,
  Mail,
  OctagonPause,
  Phone,
  ShieldCheck,
  Trophy,
  UsersRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { usePauseRetentionJourney, useRetentionDashboard } from '@/hooks/use-retention';
import { cn } from '@/lib/utils';

const STATUS_TONE = {
  draft: 'border-slate-200 bg-slate-100 text-slate-700',
  canary: 'border-amber-200 bg-amber-50 text-amber-800',
  live: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  paused: 'border-orange-200 bg-orange-50 text-orange-800',
  completed: 'border-blue-200 bg-blue-50 text-blue-800',
} as const;

const STEP_TONE: Record<number, string> = {
  3: 'border-blue-200 bg-blue-50',
  7: 'border-lime-200 bg-lime-50',
  14: 'border-violet-200 bg-violet-50',
  30: 'border-amber-200 bg-amber-50',
  60: 'border-slate-200 bg-slate-50',
};

function number(value: number): string {
  return value.toLocaleString('en-US');
}

function rate(numerator: number, denominator: number): string {
  if (!denominator) return '—';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function Metric({ label, value, note, icon: Icon }: {
  label: string;
  value: string;
  note: string;
  icon: typeof UsersRound;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-slate-950">{value}</p>
        </div>
        <div className="grid size-9 place-items-center rounded-xl bg-slate-950 text-white">
          <Icon className="size-4" />
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">{note}</p>
    </div>
  );
}

export default function RetentionPage() {
  const dashboard = useRetentionDashboard();
  const pause = usePauseRetentionJourney();

  if (dashboard.isLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-slate-500">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Loader2 className="size-4 animate-spin" /> Loading retention journey…
        </div>
      </div>
    );
  }

  if (!dashboard.data) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-red-50 text-red-600">
          <Mail className="size-5" />
        </div>
        <h1 className="mt-4 text-xl font-black text-slate-950">Retention data is unavailable</h1>
        <p className="mt-2 text-sm text-slate-500">
          The backend journey endpoint or its database migration is not available in this environment yet.
        </p>
        <Button className="mt-5" variant="outline" onClick={() => dashboard.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const data = dashboard.data;
  const dormant = data.segments.filter((segment) => segment.segment !== '0-3 days');
  const dormantPlayers = dormant.reduce((sum, segment) => sum + segment.players, 0);
  const reachable = dormant.reduce((sum, segment) => sum + segment.email_reachable, 0);
  const verifiedPhones = dormant.reduce((sum, segment) => sum + segment.verified_phone, 0);
  const control = data.funnel.find((item) => item.variant === 'control');
  const test = data.funnel.find((item) => item.variant === 'test');
  const enrolled = (control?.enrolled ?? 0) + (test?.enrolled ?? 0);
  const returned = (control?.returned_72h ?? 0) + (test?.returned_72h ?? 0);
  const maxSegment = Math.max(1, ...data.segments.map((segment) => segment.players));
  const running = data.config.status === 'canary' || data.config.status === 'live';

  const handlePause = async () => {
    if (!window.confirm('Pause this journey now? No new players or emails will be scheduled.')) return;
    try {
      await pause.mutateAsync();
      toast.success('Reactivation journey paused');
    } catch {
      toast.error('Could not pause the journey');
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-5 lg:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn('capitalize', STATUS_TONE[data.config.status])}>
              <span className={cn('mr-1.5 size-1.5 rounded-full', running ? 'bg-emerald-500' : 'bg-current')} />
              {data.config.status}
            </Badge>
            <span className="text-xs font-semibold text-slate-400">Journey v{data.config.version}</span>
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Dormant player comeback</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            A controlled email journey for Georgian players who stop playing. Players leave automatically after their next real match.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => dashboard.refetch()} disabled={dashboard.isFetching}>
            {dashboard.isFetching ? <Loader2 className="size-4 animate-spin" /> : <Clock3 className="size-4" />}
            Refresh
          </Button>
          {running ? (
            <Button variant="destructive" onClick={handlePause} disabled={pause.isPending}>
              {pause.isPending ? <Loader2 className="size-4 animate-spin" /> : <OctagonPause className="size-4" />}
              Emergency pause
            </Button>
          ) : null}
        </div>
      </header>

      {dashboard.isRefetchError ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
          <AlertTriangle className="size-4 shrink-0" />
          Live refresh failed. Showing the last successful retention snapshot.
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Dormant players" value={number(dormantPlayers)} note="Players inactive for at least 3 days" icon={UsersRound} />
        <Metric label="Email reachable" value={number(reachable)} note={`${rate(reachable, dormantPlayers)} of dormant players`} icon={Mail} />
        <Metric label="Experiment enrolled" value={number(enrolled)} note={`Hard cap ${number(data.config.assignment_cap)}`} icon={FlaskConical} />
        <Metric label="Returned in 72h" value={number(returned)} note="A real match start, not an email open" icon={Trophy} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardContent className="p-0">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-black text-slate-950">Journey flow</h2>
                  <p className="mt-0.5 text-xs text-slate-500">A player starts at the step matching their current inactivity.</p>
                </div>
                <Badge variant="outline" className="border-slate-200 text-slate-600">
                  max 1 email / {data.config.email_frequency_days} days
                </Badge>
              </div>
            </div>

            <div className="overflow-x-auto p-5">
              <div className="flex min-w-[900px] items-stretch gap-2">
                <div className="flex w-36 shrink-0 flex-col justify-center rounded-2xl border-2 border-slate-950 bg-slate-950 p-4 text-white">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Entry</p>
                  <p className="mt-1 text-sm font-black">Stops playing</p>
                  <p className="mt-2 text-[11px] leading-4 text-slate-300">Stable A/B assignment</p>
                </div>
                <div className="flex items-center text-slate-300"><ArrowRight className="size-4" /></div>
                {data.journey.map((step, index) => {
                  const summary = data.steps.find((item) => item.milestone_days === step.milestone_days);
                  return (
                    <div key={step.milestone_days} className="contents">
                      <div className={cn('w-36 shrink-0 rounded-2xl border p-3.5', STEP_TONE[step.milestone_days])}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Day {step.milestone_days}</span>
                          <Mail className="size-3.5 text-slate-500" />
                        </div>
                        <p className="mt-2 text-sm font-black text-slate-950">{step.title}</p>
                        <p className="mt-1 truncate text-[10px] font-semibold text-slate-500">{step.destination}</p>
                        <div className="mt-3 border-t border-black/5 pt-2 text-[10px] text-slate-500">
                          {number(summary?.sent ?? 0)} sent · {number(summary?.clicked ?? 0)} clicked
                        </div>
                      </div>
                      {index < data.journey.length - 1 ? (
                        <div className="flex items-center text-slate-300"><ArrowRight className="size-4" /></div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex min-w-[900px] items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
                <CheckCircle2 className="size-4 shrink-0" />
                <p className="text-xs font-bold">At every step: if the player starts a real match, unsubscribe is recorded, or the account becomes ineligible → exit immediately.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-5">
              <h2 className="font-black text-slate-950">Channels</h2>
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-black text-emerald-900"><Mail className="size-4" /> Email</div>
                    <Badge className="bg-emerald-600 text-white">Ready</Badge>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-emerald-800">Resend delivery, click tracking, signed unsubscribe, retries and suppression are connected.</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-black text-slate-700"><Phone className="size-4" /> SMS</div>
                    <Badge variant="outline" className="border-slate-300 bg-white text-slate-600"><LockKeyhole className="mr-1 size-3" /> Locked</Badge>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{number(verifiedPhones)} dormant players have verified phones, but {data.segments.reduce((sum, item) => sum + item.sms_marketing_eligible, 0)} have recorded marketing consent.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-blue-600" /><h2 className="font-black text-slate-950">Safety gates</h2></div>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
                <li>• Georgia quiet hours: {data.config.quiet_hours_start}:00–{data.config.quiet_hours_end}:00</li>
                <li>• Daily send cap: {number(data.config.daily_send_cap)}</li>
                <li>• Daily enrollment cap: {number(data.config.daily_assignment_cap)}</li>
                <li>• Control group receives no message</li>
                <li>• No personal data shown in this CMS</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(420px,0.8fr)]">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-0">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-black text-slate-950">Dormancy segments</h2>
              <p className="mt-0.5 text-xs text-slate-500">Live counts from match activity. No names, emails or phone numbers.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr><th className="px-5 py-3">Inactive</th><th className="px-4 py-3">Players</th><th className="px-4 py-3">Email reachable</th><th className="px-4 py-3">Verified mobile</th><th className="px-4 py-3">SMS consent</th></tr>
                </thead>
                <tbody>
                  {data.segments.map((segment) => (
                    <tr key={segment.segment} className="border-t border-slate-100">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900">{segment.segment}</div>
                        <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${(segment.players / maxSegment) * 100}%` }} /></div>
                      </td>
                      <td className="px-4 py-3.5 font-black tabular-nums text-slate-950">{number(segment.players)}</td>
                      <td className="px-4 py-3.5 tabular-nums text-slate-600">{number(segment.email_reachable)} <span className="text-xs text-slate-400">({rate(segment.email_reachable, segment.players)})</span></td>
                      <td className="px-4 py-3.5 tabular-nums text-slate-600">{number(segment.verified_phone)}</td>
                      <td className="px-4 py-3.5 tabular-nums text-slate-600">{number(segment.sms_marketing_eligible)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="font-black text-slate-950">A/B result</h2><p className="mt-0.5 text-xs text-slate-500">Email journey vs no-message holdout</p></div>
              <FlaskConical className="size-5 text-blue-600" />
            </div>
            <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">No email</p>
                <p className="mt-2 text-3xl font-black text-slate-950">{rate(control?.returned_72h ?? 0, control?.enrolled ?? 0)}</p>
                <p className="mt-1 text-xs text-slate-500">{number(control?.returned_72h ?? 0)} / {number(control?.enrolled ?? 0)} returned</p>
              </div>
              <div className="grid place-items-center text-[10px] font-black text-slate-300">VS</div>
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">Email journey</p>
                <p className="mt-2 text-3xl font-black text-blue-950">{rate(test?.returned_72h ?? 0, test?.enrolled ?? 0)}</p>
                <p className="mt-1 text-xs text-blue-700">{number(test?.returned_72h ?? 0)} / {number(test?.enrolled ?? 0)} returned</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
              <div className="flex justify-between gap-3 py-1"><span>Email sent</span><strong>{number(test?.sent ?? 0)}</strong></div>
              <div className="flex justify-between gap-3 py-1"><span>Delivered</span><strong>{number(test?.delivered ?? 0)}</strong></div>
              <div className="flex justify-between gap-3 py-1"><span>Clicked</span><strong>{number(test?.clicked ?? 0)}</strong></div>
              <div className="flex justify-between gap-3 py-1"><span>Played 3+ matches in 7d</span><strong>{number(test?.started_three_matches_7d ?? 0)}</strong></div>
            </div>
            <p className="mt-4 text-[11px] leading-5 text-slate-400">Email opens are diagnostic only. The decision is based on real matches compared with the no-email group.</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
