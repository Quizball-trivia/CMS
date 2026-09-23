'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowRight, BookOpenCheck, Check, CircleAlert, Clock3, FileText, Languages,
  RefreshCw, Search, ShieldCheck, Sparkles, X,
} from 'lucide-react';
import { gridReportsService } from '@/services/grid-reports.service';
import type {
  GridAliasPolicy, GridCorrectionProposal, GridLocale, GridPlayerSearchResult,
  GridReport, GridReportStatus,
} from '@/types/grid-reports';

const locales: GridLocale[] = ['en', 'ka', 'es', 'tr'];
const statusTabs: Array<{ value: GridReportStatus; label: string }> = [
  { value: 'open', label: 'Needs review' },
  { value: 'accepted', label: 'Fixed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'closed', label: 'Closed' },
];
const blankNames: Record<GridLocale, string> = { en: '', ka: '', es: '', tr: '' };
const blankAliases: Record<GridLocale, string> = { en: '', ka: '', es: '', tr: '' };

function label(report: GridReport, axis: 'row' | 'column', locale: GridLocale) {
  const candidate = report[`${axis}_label_${locale}` as keyof GridReport];
  return typeof candidate === 'string' && candidate.trim()
    ? candidate : report[`${axis}_label_en` as keyof GridReport] as string;
}

function localTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tbilisi',
  }).format(new Date(value));
}

function feedback(error: unknown) {
  return error instanceof Error ? error.message : 'Request failed. Please try again.';
}

export function GridReportDesk({ previewReports }: { previewReports?: GridReport[] }) {
  const demo = Boolean(previewReports);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<GridReportStatus>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [playerQuery, setPlayerQuery] = useState('');
  const [player, setPlayer] = useState<GridPlayerSearchResult | null>(null);
  const [names, setNames] = useState<Record<GridLocale, string>>(blankNames);
  const [aliasText, setAliasText] = useState<Record<GridLocale, string>>(blankAliases);
  const [aliasPolicy, setAliasPolicy] = useState<GridAliasPolicy>('unique_only');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [reviewerNote, setReviewerNote] = useState('');
  const [decisionReleaseId, setDecisionReleaseId] = useState('');
  const [busy, setBusy] = useState(false);

  const reportsQuery = useQuery({
    queryKey: ['grid-reports', status],
    queryFn: () => gridReportsService.list(status),
    enabled: !demo,
    refetchInterval: false,
  });
  const reports = useMemo(() => demo
    ? (previewReports ?? []).filter((item) => item.status === status)
    : reportsQuery.data?.reports ?? [], [demo, previewReports, reportsQuery.data?.reports, status]);
  const filtered = useMemo(() => reports.filter((item) => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return true;
    return [item.submitted_text, item.row_label_en, item.column_label_en,
      item.row_label_ka, item.column_label_ka, item.board_theme]
      .some((value) => value?.toLocaleLowerCase().includes(query));
  }), [reports, search]);
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    const proposal = selected.correction_proposal;
    setPlayer(proposal ? {
      id: proposal.playerId, name: proposal.check.playerName,
      display_name: proposal.names, in_grid_catalog: true,
    } : null);
    setPlayerQuery(proposal?.check.playerName ?? selected.submitted_text);
    setNames(proposal?.names ?? blankNames);
    const aliases = { ...blankAliases };
    if (proposal) for (const locale of locales) {
      aliases[locale] = proposal.aliases.filter((item) => item.locale === locale)
        .map((item) => item.value).join('\n');
    }
    else aliases[selected.locale] = selected.submitted_text;
    setAliasText(aliases);
    setAliasPolicy(proposal?.aliases[0]?.acceptancePolicy ?? 'unique_only');
    setEvidenceUrl(proposal?.evidenceUrl ?? '');
    setEvidenceNote(proposal?.evidenceNote ?? '');
    setReviewerNote(proposal?.reviewerNote ?? '');
    setDecisionReleaseId(selected.decision_release_id ?? '');
  }, [selected]);

  const playerSearch = useQuery({
    queryKey: ['grid-player-search', playerQuery],
    queryFn: () => gridReportsService.searchPlayers(playerQuery.trim()),
    enabled: !demo && Boolean(selected) && !player && playerQuery.trim().length >= 2,
  });
  const playerCheck = useQuery({
    queryKey: ['grid-player-check', selected?.id, player?.id],
    queryFn: () => gridReportsService.checkPlayer(selected!.id, player!.id),
    enabled: !demo && Boolean(selected && player),
  });
  const check = demo ? selected?.correction_proposal?.check ?? null : playerCheck.data ?? null;
  const needsFactEvidence = Boolean(check && (!check.rowMember || !check.columnMember || !check.boardAnswer));
  const canSave = Boolean(selected && player && check && locales.every((locale) =>
    names[locale].trim().length >= 2 && aliasText[locale].trim().length >= 2)
    && (!needsFactEvidence || (evidenceUrl.trim() && evidenceNote.trim())) && !busy && !demo);

  const choosePlayer = (candidate: GridPlayerSearchResult) => {
    setPlayer(candidate);
    setPlayerQuery(candidate.name);
    const proposedNames = {
      en: candidate.display_name?.en || candidate.name,
      ka: candidate.display_name?.ka || '',
      es: candidate.display_name?.es || candidate.display_name?.en || candidate.name,
      tr: candidate.display_name?.tr || candidate.display_name?.en || candidate.name,
    };
    setNames(proposedNames);
    setAliasText(Object.fromEntries(locales.map((locale) => [
      locale,
      [proposedNames[locale], locale === selected?.locale ? selected.submitted_text : '']
        .filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join('\n'),
    ])) as Record<GridLocale, string>);
  };

  const save = async () => {
    if (!selected || !player || !canSave) return;
    const aliases: GridCorrectionProposal['aliases'] = locales.flatMap((locale) =>
      aliasText[locale].split(/[\n,]+/).map((value) => value.trim()).filter(Boolean)
        .map((value) => ({ locale, value, acceptancePolicy: aliasPolicy })));
    const proposal: GridCorrectionProposal = {
      playerId: player.id,
      names: Object.fromEntries(locales.map((locale) => [locale, names[locale].trim()])) as Record<GridLocale, string>,
      aliases,
      ...(evidenceUrl.trim() ? { evidenceUrl: evidenceUrl.trim() } : {}),
      ...(evidenceNote.trim() ? { evidenceNote: evidenceNote.trim() } : {}),
      ...(reviewerNote.trim() ? { reviewerNote: reviewerNote.trim() } : {}),
    };
    setBusy(true);
    try {
      await gridReportsService.saveProposal(selected.id, proposal);
      await queryClient.invalidateQueries({ queryKey: ['grid-reports'] });
      toast.success('Correction draft saved. Gameplay has not changed.');
    } catch (error) { toast.error(feedback(error)); }
    finally { setBusy(false); }
  };

  const decide = async (next: Exclude<GridReportStatus, 'open'>) => {
    if (!selected || demo || busy) return;
    if (!reviewerNote.trim()) { toast.error('Add a review note first.'); return; }
    if (next === 'accepted' && !decisionReleaseId.trim()) {
      toast.error('Enter the published correcting release ID.'); return;
    }
    setBusy(true);
    try {
      await gridReportsService.decide(selected.id, {
        status: next, notes: reviewerNote.trim(),
        ...(next === 'accepted' ? { decisionReleaseId: decisionReleaseId.trim() } : {}),
      });
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ['grid-reports'] });
      toast.success(next === 'accepted' ? 'Fix verified against the published release.' : `Report marked ${next}.`);
    } catch (error) { toast.error(feedback(error)); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-7 pb-16 text-slate-950">
      <header className="relative overflow-hidden rounded-[28px] bg-slate-950 px-7 py-8 text-white shadow-xl shadow-slate-200/50 sm:px-10">
        <div className="absolute -right-12 -top-20 size-64 rounded-full border-[40px] border-blue-600/20" aria-hidden="true" />
        <div className="absolute -bottom-24 right-44 size-48 rotate-12 rounded-[42px] bg-yellow-400/10" aria-hidden="true" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-yellow-300">
              <BookOpenCheck className="size-4" /> Content quality desk
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Football Grid answer reports</h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-300">
              Review the exact answer and clues a player saw. Prepare a sourced correction across four languages.
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-right backdrop-blur">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">Queue</p>
            <p className="text-2xl font-black tabular-nums">{reports.length}</p>
          </div>
        </div>
      </header>

      {demo && <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-900">
        Local design preview with sample reports. Review actions are disabled here.
      </div>}

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Report status">
        {statusTabs.map((tab) => <button key={tab.value} type="button" role="tab" aria-selected={status === tab.value}
          onClick={() => { setStatus(tab.value); setSelectedId(null); }}
          className={`rounded-full px-4 py-2 text-sm font-bold transition ${status === tab.value
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:text-slate-950'}`}>
          {tab.label}
        </button>)}
        <button type="button" onClick={() => reportsQuery.refetch()} disabled={demo}
          className="ml-auto grid size-9 place-items-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200 hover:text-blue-600 disabled:opacity-40" aria-label="Refresh reports">
          <RefreshCw className="size-4" />
        </button>
      </div>

      {reportsQuery.error && !demo && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900">
        Could not load reports: {feedback(reportsQuery.error)}
      </div>}

      <div className="grid min-h-[660px] gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <label className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 text-slate-500">
              <Search className="size-4" />
              <span className="sr-only">Search reports</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Player, clue or pack"
                className="h-11 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
            </label>
          </div>
          <div className="max-h-[780px] overflow-y-auto p-2">
            {reportsQuery.isLoading && !demo && <p className="p-4 text-sm text-slate-500">Loading reports…</p>}
            {!reportsQuery.isLoading && filtered.length === 0 && <p className="p-4 text-sm text-slate-500">No reports in this view.</p>}
            {filtered.map((report) => <button type="button" key={report.id} onClick={() => setSelectedId(report.id)}
              className={`mb-1 w-full rounded-2xl p-4 text-left transition ${selected?.id === report.id
                ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-slate-50'}`}>
              <div className="flex items-start justify-between gap-3">
                <span className="truncate text-base font-black text-slate-950">{report.submitted_text}</span>
                {report.correction_proposal && <span title="Correction draft saved" className="rounded-lg bg-emerald-100 p-1 text-emerald-700"><FileText className="size-3.5" /></span>}
              </div>
              <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-slate-500">
                {label(report, 'row', 'en')} <span className="text-blue-500">×</span> {label(report, 'column', 'en')}
              </p>
              <div className="mt-3 flex items-center justify-between text-[11px] font-bold text-slate-400">
                <span className="uppercase tracking-wide">{report.board_theme}</span>
                <span>{localTime(report.created_at)}</span>
              </div>
            </button>)}
          </div>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          {!selected ? <div className="grid h-full min-h-[620px] place-items-center p-10 text-center text-slate-400">
            <div><CircleAlert className="mx-auto mb-3 size-9" /><p>Choose a report to inspect.</p></div>
          </div> : <div className="divide-y divide-slate-100">
            <section className="p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-600">Player submission</p>
                  <h2 className="mt-2 break-words text-3xl font-black tracking-tight">{selected.submitted_text}</h2>
                  <p className="mt-2 text-sm text-slate-500">Marked <strong>{selected.outcome}</strong> in a {selected.locale.toUpperCase()} game · {localTime(selected.created_at)}</p>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-amber-900">{selected.status}</span>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-blue-500">Row clue</p>
                  <p className="text-lg font-black">{label(selected, 'row', selected.locale)}</p>
                  <p className="mt-1 break-all text-[11px] text-slate-400">{selected.row_criterion_key}</p>
                </div>
                <span className="text-center text-2xl font-black text-slate-300">×</span>
                <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4">
                  <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-amber-600">Column clue</p>
                  <p className="text-lg font-black">{label(selected, 'column', selected.locale)}</p>
                  <p className="mt-1 break-all text-[11px] text-slate-400">{selected.column_criterion_key}</p>
                </div>
              </div>
              <p className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                <Clock3 className="size-3.5" /> Original release {selected.content_release_version} · {selected.board_theme} board · cell {selected.cell_index + 1}
              </p>
            </section>

            <section className="space-y-6 p-6 sm:p-8">
              <div>
                <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-blue-600"><Sparkles className="size-4" /> Correction draft</p>
                <h3 className="mt-2 text-xl font-black">Match the player. Check both facts. Review the names.</h3>
                <p className="mt-1 text-sm text-slate-500">Saving a draft records your proposal; it does not change answers in live games.</p>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <label htmlFor="grid-player-search" className="text-xs font-black uppercase tracking-wide text-slate-600">Footballer identity</label>
                  <input id="grid-player-search" value={playerQuery} onChange={(event) => { setPlayerQuery(event.target.value); setPlayer(null); }}
                    placeholder="Search the player catalog" className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" />
                  {!player && playerQuery.trim().length >= 2 && <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                    {playerSearch.isLoading && !demo && <p className="p-3 text-sm text-slate-400">Searching…</p>}
                    {!demo && playerSearch.data?.players.map((candidate) => <button key={candidate.id} type="button" onClick={() => choosePlayer(candidate)}
                      className="flex w-full items-center justify-between rounded-lg p-2.5 text-left text-sm hover:bg-blue-50">
                      <span className="font-bold">{candidate.name}</span>
                      <span className="text-xs text-slate-400">{candidate.in_grid_catalog ? 'Grid player' : 'Catalog player'}</span>
                    </button>)}
                    {!demo && !playerSearch.isLoading && playerSearch.data?.players.length === 0 && <p className="p-3 text-sm text-slate-400">No matching identity. Add the player through the content catalog first.</p>}
                    {demo && <p className="p-3 text-sm text-slate-400">Search is disabled in preview.</p>}
                  </div>}
                  {player && <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-700"><Check className="size-3.5" /> Selected: {player.name}</p>}
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Original board check</p>
                  {player && playerCheck.isLoading && !demo ? <p className="mt-3 text-sm text-slate-500">Checking original release…</p>
                    : check ? <div className="mt-3 space-y-2 text-sm">
                      <p className={check.rowMember ? 'text-emerald-700' : 'text-amber-700'}>{check.rowMember ? '✓' : '!'} Row fact {check.rowMember ? 'exists' : 'needs evidence'}</p>
                      <p className={check.columnMember ? 'text-emerald-700' : 'text-amber-700'}>{check.columnMember ? '✓' : '!'} Column fact {check.columnMember ? 'exists' : 'needs evidence'}</p>
                      <p className={check.boardAnswer ? 'text-emerald-700' : 'text-amber-700'}>{check.boardAnswer ? '✓' : '!'} Board answer {check.boardAnswer ? 'included' : 'missing from this cell'}</p>
                      <p className={check.submittedNameRecognized ? 'text-emerald-700' : 'text-amber-700'}>{check.submittedNameRecognized ? '✓' : '!'} Submitted spelling {check.submittedNameRecognized ? 'recognized' : 'not recognized'}</p>
                      {check.otherAliasOwners > 0 && <p className="font-semibold text-rose-700">Name is also owned by {check.otherAliasOwners} other player(s).</p>}
                    </div> : <p className="mt-3 text-sm text-slate-500">Choose a player to see whether this is a fact gap or a name gap.</p>}
                </div>
              </div>

              <div>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-600"><Languages className="size-4" /> Display names in all four languages</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {locales.map((locale) => <label key={locale} className="text-xs font-bold uppercase text-slate-500">{locale}
                    <input value={names[locale]} onChange={(event) => setNames((current) => ({ ...current, [locale]: event.target.value }))}
                      placeholder={`${locale.toUpperCase()} player name`} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-medium normal-case text-slate-900 outline-none focus:border-blue-500" />
                  </label>)}
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div><p className="text-xs font-black uppercase tracking-wide text-slate-600">Accepted spellings</p>
                    <p className="mt-1 text-xs text-slate-500">One per line. Add a surname only if it points to the right player for this cell.</p></div>
                  <label className="text-xs font-bold text-slate-500">Matching policy
                    <select value={aliasPolicy} onChange={(event) => setAliasPolicy(event.target.value as GridAliasPolicy)}
                      className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950">
                      <option value="exact">Exact only</option><option value="unique_only">Unique name</option><option value="safe_typo">Reviewed typo tolerance</option>
                    </select>
                  </label>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {locales.map((locale) => <label key={locale} className="text-xs font-bold uppercase text-slate-500">{locale} variants
                    <textarea rows={3} value={aliasText[locale]} onChange={(event) => setAliasText((current) => ({ ...current, [locale]: event.target.value }))}
                      placeholder="One accepted form per line" className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm font-medium normal-case text-slate-900 outline-none focus:border-blue-500" />
                  </label>)}
                </div>
                <p className="mt-2 text-xs text-slate-500">Accents and case are normalized. Typo matching still needs collision checks before release.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold uppercase text-slate-500">Evidence URL {needsFactEvidence && <span className="text-rose-600">required</span>}
                  <input value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="https://official-source…"
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-medium normal-case text-slate-900 outline-none focus:border-blue-500" />
                </label>
                <label className="text-xs font-bold uppercase text-slate-500">What the source proves {needsFactEvidence && <span className="text-rose-600">required</span>}
                  <input value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} placeholder="Club, season, manager, trophy…"
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-medium normal-case text-slate-900 outline-none focus:border-blue-500" />
                </label>
              </div>
              <label className="block text-xs font-bold uppercase text-slate-500">Reviewer notes
                <textarea rows={2} value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} placeholder="Why this answer should or should not be accepted"
                  className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm font-medium normal-case text-slate-900 outline-none focus:border-blue-500" />
              </label>
              <div className="flex flex-wrap items-center gap-4">
                <button type="button" onClick={save} disabled={!canSave}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45">
                  <FileText className="size-4" /> {selected.correction_proposal ? 'Update correction draft' : 'Save correction draft'} <ArrowRight className="size-4" />
                </button>
                {selected.proposed_at && <p className="text-xs font-bold text-emerald-700">Draft saved {localTime(selected.proposed_at)}</p>}
              </div>
            </section>

            {selected.status === 'open' && <section className="space-y-4 bg-slate-50 p-6 sm:p-8">
              <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-slate-700" /><h3 className="font-black">Review decision</h3></div>
              <p className="text-sm text-slate-500">A saved draft is not a fix. Mark “Fixed” only after a newer published release accepts the submitted answer for both clues.</p>
              <label className="block max-w-md text-xs font-bold uppercase text-slate-500">Correcting release ID
                <input value={decisionReleaseId} onChange={(event) => setDecisionReleaseId(event.target.value)} placeholder="Published release UUID"
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-medium normal-case text-slate-900 outline-none focus:border-blue-500" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={demo || busy} onClick={() => decide('accepted')} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Check className="size-4" /> Mark fixed</button>
                <button type="button" disabled={demo || busy} onClick={() => decide('rejected')} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-700 disabled:opacity-40"><X className="size-4" /> Reject</button>
                <button type="button" disabled={demo || busy} onClick={() => decide('duplicate')} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 disabled:opacity-40">Duplicate</button>
              </div>
            </section>}
          </div>}
        </section>
      </div>
    </div>
  );
}
