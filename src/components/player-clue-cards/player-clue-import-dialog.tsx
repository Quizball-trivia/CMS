'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { usePreviewPlayerClueImport, useCommitPlayerClueImport } from '@/hooks';
import type { PreviewRow, PreviewResult, CommitRow, ClueCardLocale, ClueCardDifficulty, ClueCardImportStatus } from '@/types';
import { Upload, FileText, CheckCircle2, AlertTriangle, Loader2, Sparkles, User, Copy } from 'lucide-react';

const FORMAT_HINT = `Player 1 Clue 1: I am the all-time top scorer in La Liga history. Clue 2: I have won the Ballon d'Or more times than any other player. Clue 3: I captained my country to victory in the 2022 FIFA World Cup. Answer: Lionel Messi
Player 2 Clue 1: ... Clue 2: ... Clue 3: ... Answer: Cristiano Ronaldo. Easy`;

const difficultyBadge = (diff: string, source?: string) => {
  const colors: Record<string, string> = { easy: 'bg-green-600', medium: 'bg-yellow-500 text-black', hard: 'bg-red-600' };
  return (
    <span className="inline-flex items-center gap-1">
      <Badge className={colors[diff] ?? 'bg-gray-500'}>{diff}</Badge>
      {source === 'ai' && (
        <span title="Difficulty assigned by AI from the clues">
          <Sparkles className="h-3 w-3 text-purple-500" />
        </span>
      )}
    </span>
  );
};

export function PlayerClueImportDialog() {
  const [text, setText] = useState('');
  const [locale, setLocale] = useState<ClueCardLocale>('en');
  const [defaultDifficulty, setDefaultDifficulty] = useState<ClueCardDifficulty>('medium');
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [rowOverrides, setRowOverrides] = useState<Record<number, string>>({});
  const [commitStatus, setCommitStatus] = useState<ClueCardImportStatus>('needs_review');
  const [force, setForce] = useState(false);
  const [commitResult, setCommitResult] = useState<{ inserted: number; updated: number; skipped: number; failed: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewMutation = usePreviewPlayerClueImport();
  const commitMutation = useCommitPlayerClueImport();

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(reader.result as string);
    reader.readAsText(file);
  }, []);

  const getResolvedPlayerId = useCallback((row: PreviewRow): string | null => {
    if (rowOverrides[row.rowIndex]) return rowOverrides[row.rowIndex];
    if (row.matchedPlayer) return row.matchedPlayer.footballPlayerId;
    return null;
  }, [rowOverrides]);

  // A row can be committed only if it parsed cleanly AND resolves to a DB player.
  // Unmatched rows (no player in our DB) cannot attach a clue, so we hide them.
  const committableRows = useMemo(() => {
    if (!previewResult) return [];
    return previewResult.rows.filter(
      (r) => r.validationErrors.length === 0 && (r.matchedPlayer || r.candidates.length > 0)
    );
  }, [previewResult]);

  const hiddenUnmatched = useMemo(() => {
    if (!previewResult) return 0;
    return previewResult.rows.length - committableRows.length;
  }, [previewResult, committableRows]);

  const handlePreview = useCallback(() => {
    if (!text.trim()) return;
    setCommitResult(null);
    previewMutation.mutate(
      { text, locale, defaultDifficulty },
      {
        onSuccess: (result) => {
          setPreviewResult(result);
          // Pre-select clean exact matches; leave duplicates (same player twice
          // in the paste, or already in the DB) UNCHECKED so they aren't
          // committed by accident.
          const matched = new Set<number>();
          result.rows.forEach((row) => {
            if (
              row.validationErrors.length === 0 &&
              row.matchedPlayer &&
              !row.duplicateInBatch &&
              !row.alreadyHasCard
            ) {
              matched.add(row.rowIndex);
            }
          });
          setSelectedRows(matched);
        },
      }
    );
  }, [text, locale, defaultDifficulty, previewMutation]);

  const handleCommit = useCallback(() => {
    if (!previewResult) return;
    const rows: CommitRow[] = [];
    for (const row of previewResult.rows) {
      if (!selectedRows.has(row.rowIndex)) continue;
      const playerId = getResolvedPlayerId(row);
      if (!playerId) continue;
      rows.push({
        rowIndex: row.rowIndex,
        answerName: row.answerName,
        difficulty: row.difficulty,
        clue1: row.clue1,
        clue2: row.clue2,
        clue3: row.clue3,
        footballPlayerId: playerId,
        originalText: row.originalText,
        sourcePlayerNumber: row.sourcePlayerNumber,
        manualMapping: !!rowOverrides[row.rowIndex] || !row.matchedPlayer,
        matchMethod: row.matchMethod ?? null,
        matchConfidence: row.matchConfidence ?? null,
        factRiskFlags: row.factRiskFlags,
      });
    }
    if (rows.length === 0) return;
    commitMutation.mutate(
      { locale, defaultDifficulty, status: commitStatus, force, rows },
      {
        onSuccess: (result) => {
          setCommitResult({
            inserted: result.inserted,
            updated: result.updated,
            skipped: result.skippedExisting,
            failed: result.failed,
          });
        },
      }
    );
  }, [previewResult, selectedRows, rowOverrides, getResolvedPlayerId, locale, defaultDifficulty, commitStatus, force, commitMutation]);

  const toggleRow = (rowIndex: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  };

  const acceptAllMatched = () => {
    // Skip duplicates by default; the editor can still tick them manually.
    setSelectedRows(
      new Set(
        committableRows
          .filter((r) => getResolvedPlayerId(r) && !r.duplicateInBatch && !r.alreadyHasCard)
          .map((r) => r.rowIndex)
      )
    );
  };
  const rejectAll = () => setSelectedRows(new Set());

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Player Clue Cards Import</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Locale</Label>
              <Select value={locale} onValueChange={(v) => setLocale(v as ClueCardLocale)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ka">Georgian</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fallback Difficulty</Label>
              <Select value={defaultDifficulty} onValueChange={(v) => setDefaultDifficulty(v as ClueCardDifficulty)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Alert>
            <AlertDescription className="space-y-1 text-xs">
              <p className="font-semibold">Suggested format (one player per line):</p>
              <pre className="whitespace-pre-wrap rounded bg-muted p-2 font-mono text-[11px] leading-relaxed">{FORMAT_HINT}</pre>
              <p className="text-muted-foreground">
                Difficulty is optional — add <code>Difficulty: hard</code> or just <code>. Easy</code> after the answer,
                or leave it out and the AI will read the clues and assign one. Players are matched to your database
                automatically; clues for players not in the database are skipped.
              </p>
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label>Upload .txt file</Label>
            <Input ref={fileInputRef} type="file" accept=".txt" onChange={handleFileUpload} />
          </div>

          <div className="space-y-2">
            <Label>Or paste raw text</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Player 1 Clue 1: ... Clue 2: ... Clue 3: ... Answer: Lionel Messi"
              rows={6}
            />
          </div>

          <Button onClick={handlePreview} disabled={!text.trim() || previewMutation.isPending}>
            {previewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Preview & match players
          </Button>
        </CardContent>
      </Card>

      {previewResult && (
        <Card>
          <CardHeader>
            <CardTitle>Preview — {selectedRows.size} of {committableRows.length} selected</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-green-600" /> Matched: {previewResult.matchedCount}</span>
              <span className="flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-yellow-500" /> Ambiguous: {previewResult.ambiguousCount}</span>
              {!!previewResult.duplicateCount && (
                <span className="flex items-center gap-1 text-orange-600"><Copy className="h-4 w-4" /> Duplicates: {previewResult.duplicateCount}</span>
              )}
              {hiddenUnmatched > 0 && (
                <span className="text-muted-foreground">{hiddenUnmatched} unmatched hidden (no player in DB)</span>
              )}
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={acceptAllMatched}>Accept all matched</Button>
                <Button variant="outline" size="sm" onClick={rejectAll}>Reject all</Button>
              </div>
            </div>

            <div className="max-h-[520px] space-y-3 overflow-auto pr-1">
              {committableRows.map((row) => {
                const resolved = getResolvedPlayerId(row);
                const selected = selectedRows.has(row.rowIndex);
                const player = row.matchedPlayer;
                return (
                  <div
                    key={row.rowIndex}
                    className={`flex gap-3 rounded-lg border p-3 transition-colors ${selected ? 'border-green-500 bg-green-50/50' : 'border-border'}`}
                  >
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => toggleRow(row.rowIndex)}
                      disabled={!resolved}
                      className="mt-1"
                    />

                    {/* Matched player photo + name */}
                    <div className="flex w-44 shrink-0 flex-col items-center gap-1 border-r pr-3 text-center">
                      {player?.imageUrl ? (
                        <Image src={player.imageUrl} alt={player.name} width={56} height={56} className="h-14 w-14 rounded-full object-cover" unoptimized />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted"><User className="h-6 w-6 text-muted-foreground" /></div>
                      )}
                      <div className="text-xs font-semibold">{row.answerName}</div>
                      {player ? (
                        <Badge variant="default" className="bg-green-600 text-[10px]">{player.name}</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-yellow-500 text-[10px] text-black">pick player ↓</Badge>
                      )}
                      {row.duplicateInBatch && (
                        <Badge variant="outline" className="border-orange-400 text-[10px] text-orange-600">duplicate in upload</Badge>
                      )}
                      {row.alreadyHasCard && (
                        <Badge variant="outline" className="border-orange-400 text-[10px] text-orange-600">already in DB</Badge>
                      )}
                      <div className="mt-1">{difficultyBadge(row.difficulty, row.difficultySource)}</div>
                    </div>

                    {/* Full clues */}
                    <div className="min-w-0 flex-1 space-y-1.5 text-sm">
                      <p><span className="font-semibold text-muted-foreground">1.</span> {row.clue1}</p>
                      <p><span className="font-semibold text-muted-foreground">2.</span> {row.clue2}</p>
                      <p><span className="font-semibold text-muted-foreground">3.</span> {row.clue3}</p>
                      {!player && row.candidates.length > 0 && (
                        <Select
                          value={rowOverrides[row.rowIndex] ?? ''}
                          onValueChange={(v) => setRowOverrides((prev) => ({ ...prev, [row.rowIndex]: v }))}
                        >
                          <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select the correct player..." /></SelectTrigger>
                          <SelectContent>
                            {row.candidates.map((c) => (
                              <SelectItem key={c.footballPlayerId} value={c.footballPlayerId}>
                                {c.name}{c.currentClub ? ` (${c.currentClub})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-4 rounded border p-4">
              <div className="flex items-center gap-2">
                <Label>Save as:</Label>
                <Select value={commitStatus} onValueChange={(v) => setCommitStatus(v as ClueCardImportStatus)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="needs_review">Needs Review</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={force} onCheckedChange={(v) => setForce(!!v)} />
                <Label>Overwrite duplicates</Label>
              </div>
              <Button onClick={handleCommit} disabled={commitMutation.isPending || selectedRows.size === 0} className="ml-auto">
                {commitMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Accept {selectedRows.size} card{selectedRows.size === 1 ? '' : 's'}
              </Button>
            </div>

            {commitResult && (
              <Alert>
                <AlertDescription>
                  Import complete: {commitResult.inserted} inserted, {commitResult.updated} updated, {commitResult.skipped} skipped (existing), {commitResult.failed} failed.
                  Cards saved as <strong>{commitStatus}</strong>.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
