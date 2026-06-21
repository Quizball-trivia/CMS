'use client';

import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePreviewPlayerClueImport, useCommitPlayerClueImport } from '@/hooks';
import type { PreviewRow, PreviewResult, CommitRow, ClueCardLocale, ClueCardDifficulty, ClueCardImportStatus } from '@/types';
import { Upload, FileText, CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';

const matchStatusBadge = (status: PreviewRow['matchStatus']) => {
  if (status === 'matched') return <Badge variant="default" className="bg-green-600">Matched</Badge>;
  if (status === 'ambiguous') return <Badge variant="secondary" className="bg-yellow-500 text-black">Ambiguous</Badge>;
  return <Badge variant="destructive">Unmatched</Badge>;
};

const difficultyBadge = (diff: string) => {
  const colors: Record<string, string> = { easy: 'bg-green-600', medium: 'bg-yellow-500 text-black', hard: 'bg-red-600' };
  return <Badge className={colors[diff] ?? 'bg-gray-500'}>{diff}</Badge>;
};

export function PlayerClueImportDialog() {
  const [text, setText] = useState('');
  const [locale, setLocale] = useState<ClueCardLocale>('en');
  const [defaultDifficulty, setDefaultDifficulty] = useState<ClueCardDifficulty>('medium');
  const [promptVersion, setPromptVersion] = useState('editor-v1');
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
    reader.onload = () => {
      setText(reader.result as string);
    };
    reader.readAsText(file);
  }, []);

  const handlePreview = useCallback(() => {
    if (!text.trim()) return;
    setCommitResult(null);
    previewMutation.mutate(
      { text, locale, promptVersion, defaultDifficulty },
      {
        onSuccess: (result) => {
          setPreviewResult(result);
          const validRows = new Set<number>();
          result.rows.forEach((row) => {
            if (row.validationErrors.length === 0 && (row.matchStatus === 'matched' || row.candidates.length > 0)) {
              validRows.add(row.rowIndex);
            }
          });
          setSelectedRows(validRows);
        },
      }
    );
  }, [text, locale, promptVersion, defaultDifficulty, previewMutation]);

  const getResolvedPlayerId = (row: PreviewRow): string | null => {
    if (rowOverrides[row.rowIndex]) return rowOverrides[row.rowIndex];
    if (row.matchedPlayer) return row.matchedPlayer.footballPlayerId;
    return null;
  };

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
      { locale, promptVersion, defaultDifficulty, status: commitStatus, force, rows },
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
  }, [previewResult, selectedRows, rowOverrides, locale, promptVersion, defaultDifficulty, commitStatus, force, commitMutation]);

  const toggleRow = (rowIndex: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  };

  const toggleAll = () => {
    if (!previewResult) return;
    setSelectedRows((prev) => {
      if (prev.size === previewResult.rows.length) return new Set();
      return new Set(previewResult.rows.map((r) => r.rowIndex));
    });
  };

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
              <Label>Default Difficulty</Label>
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

          <div className="space-y-2">
            <Label>Prompt Version</Label>
            <Input value={promptVersion} onChange={(e) => setPromptVersion(e.target.value)} />
          </div>

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
            Preview
          </Button>
        </CardContent>
      </Card>

      {previewResult && (
        <Card>
          <CardHeader>
            <CardTitle>Preview ({previewResult.rowsParsed} rows)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-green-600" /> Matched: {previewResult.matchedCount}</span>
              <span className="flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-yellow-500" /> Ambiguous: {previewResult.ambiguousCount}</span>
              <span className="flex items-center gap-1"><XCircle className="h-4 w-4 text-red-600" /> Unmatched: {previewResult.unmatchedCount}</span>
            </div>

            <div className="max-h-[500px] overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"><Checkbox checked={selectedRows.size === previewResult.rows.length} onCheckedChange={toggleAll} /></TableHead>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Answer</TableHead>
                    <TableHead>Diff</TableHead>
                    <TableHead>Clues</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Resolve</TableHead>
                    <TableHead>Flags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewResult.rows.map((row) => {
                    const resolved = getResolvedPlayerId(row);
                    const canCommit = row.validationErrors.length === 0 && !!resolved;
                    return (
                      <TableRow key={row.rowIndex}>
                        <TableCell>
                          <Checkbox
                            checked={selectedRows.has(row.rowIndex)}
                            onCheckedChange={() => toggleRow(row.rowIndex)}
                            disabled={!canCommit}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{row.rowIndex}</TableCell>
                        <TableCell className="font-medium">{row.answerName}</TableCell>
                        <TableCell>{difficultyBadge(row.difficulty)}</TableCell>
                        <TableCell className="max-w-xs">
                          <div className="space-y-1 text-xs text-muted-foreground">
                            <div>1: {row.clue1.slice(0, 60)}{row.clue1.length > 60 ? '...' : ''}</div>
                            <div>2: {row.clue2.slice(0, 60)}{row.clue2.length > 60 ? '...' : ''}</div>
                            <div>3: {row.clue3.slice(0, 60)}{row.clue3.length > 60 ? '...' : ''}</div>
                          </div>
                        </TableCell>
                        <TableCell>{matchStatusBadge(row.matchStatus)}</TableCell>
                        <TableCell>
                          {row.matchedPlayer ? (
                            <span className="text-xs text-green-600">{row.matchedPlayer.name}</span>
                          ) : row.candidates.length > 0 ? (
                            <Select
                              value={rowOverrides[row.rowIndex] ?? ''}
                              onValueChange={(v) => setRowOverrides((prev) => ({ ...prev, [row.rowIndex]: v }))}
                            >
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select player..." /></SelectTrigger>
                              <SelectContent>
                                {row.candidates.map((c) => (
                                  <SelectItem key={c.footballPlayerId} value={c.footballPlayerId}>
                                    {c.name} {c.currentClub ? `(${c.currentClub})` : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              placeholder="Enter player ID..."
                              className="h-8 text-xs"
                              value={rowOverrides[row.rowIndex] ?? ''}
                              onChange={(e) => setRowOverrides((prev) => ({ ...prev, [row.rowIndex]: e.target.value }))}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {row.validationErrors.length > 0 && (
                              <div className="text-xs text-red-600">
                                {row.validationErrors.map((e, i) => <div key={i}>{e}</div>)}
                              </div>
                            )}
                            {row.factRiskFlags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {row.factRiskFlags.map((flag, i) => (
                                  <Badge key={i} variant="outline" className="text-xs text-yellow-600 border-yellow-400">{flag}</Badge>
                                ))}
                              </div>
                            )}
                            {row.warnings.includes('difficulty_defaulted') && (
                              <Badge variant="outline" className="text-xs">difficulty defaulted</Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center gap-4 rounded border p-4">
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
              <Button
                onClick={handleCommit}
                disabled={commitMutation.isPending || selectedRows.size === 0}
                className="ml-auto"
              >
                {commitMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Commit {selectedRows.size} rows
              </Button>
            </div>

            {commitResult && (
              <Alert>
                <AlertDescription>
                  Import complete: {commitResult.inserted} inserted, {commitResult.updated} updated, {commitResult.skipped} skipped (existing), {commitResult.failed} failed.
                  Cards saved as <strong>{commitStatus}</strong>. Use the status endpoint to publish reviewed cards.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
