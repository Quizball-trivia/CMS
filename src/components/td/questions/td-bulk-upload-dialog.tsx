'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Info, Loader2, Trash2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { getDifficultyVariant } from '@/components/ui/difficulty-signal';
import { releasedImage, TdMediaThumb } from '@/components/td/media/td-media';
import { tdKeys, useTdAllRows, useTdWrite } from '@/hooks/use-td-content';
import type { TdContentType } from '@/lib/td/admin-api';
import { TdApiError } from '@/lib/td/api-client';
import { tdAdmin, tdTokens } from '@/lib/td/client';
import type { ContentImportReport } from '@/lib/td/contract';
import { tdErrorText } from '@/lib/td/errors';
import { canonicalJson, sha256Hex } from '@/lib/td/hash';
import { t, tc, tn } from '@/lib/td/i18n';
import { TD_IMPORT_MAX_BYTES, TD_IMPORT_MAX_ITEMS, tdImportLimits } from '@/lib/td/import-format';
import { batchKeyFor, markSent, retireBatchKey } from '@/lib/td/import-keys';
import { beginOperation, type TdOperation } from '@/lib/td/operation';
import {
  careerClubs,
  parseTdUpload,
  TD_UPLOAD_EXAMPLES,
  TD_UPLOAD_TYPES,
  tdQuestionSummary,
  toTdImportItem,
  type TdClubRef,
  type TdParseError,
  type TdParsedQuestion,
  type TdUploadContext,
  type TdUploadType,
} from '@/lib/td/upload-format';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';

type UploadQuestionType = TdUploadType;

type RowIssue = ContentImportReport['rows'][number]['issues'][number];

type ParsedRow = TdParsedQuestion & { id: string };

interface UploadState {
  parseErrors: TdParseError[];
  isUploading: boolean;
}

/** What the check says of one question, with where it stands in the list. */
interface QuestionWithSelection {
  question: ParsedRow;
  isSelected: boolean;
  isDuplicate: boolean;
  problems: RowIssue[];
  /** The check has answered for the import item this question becomes. */
  checked: boolean;
}

const NEW = '__new__';
const MAX_MB = TD_IMPORT_MAX_BYTES / 1024 / 1024;
const PAGE_SIZE = 100;
const STATUSES = 'draft,ready,approved';

const TYPE_OPTIONS: Array<{ value: UploadQuestionType; label: string }> = [
  { value: 'cards', label: t('Round I · ბარათონი') },
  { value: 'whoami-subjects', label: t('Round II · გამარჯობა') },
  { value: 'box-questions', label: t('Round III · პაპა კარლოს ყუთი') },
  { value: 'penalty-questions', label: t('Penalties') },
  { value: 'practice-questions', label: t('Practice · ივარჯიშე') },
  { value: 'football-logic', label: t('Daily · Football Logic') },
  { value: 'put-in-order', label: t('Daily · Put in Order') },
  { value: 'career-path', label: t('Daily · Career Path') },
];

const FORMAT_NOTES: Partial<Record<UploadQuestionType, string[]>> = {
  cards: [
    t('Points is 1, 2 or 3. Optional: “Image: messi-portrait” gives the key of an image already uploaded, and “Photo: 158023 | 25_1” a SoFIFA player id and version. Images are not uploaded here.'),
  ],
  'practice-questions': [t('Optional: “Image: dinamo-stadium” gives the key of an image already uploaded. Images are not uploaded here.')],
  'football-logic': [t('Image A and Image B are optional. Each is a web address starting with https:// or a path starting with /.')],
  'put-in-order': [t('The items are listed in the order they are shown; the Answer lists them in the right order.')],
  'career-path': [
    t('Each club is matched by its name to the clubs list for its crest; a club that is not on the list has no crest. Players are asked “Whose career is this?” unless a “Prompt:” line says otherwise.'),
  ],
};

/** Single words that other screens may word differently: filed under their own context. */
const WORDS = {
  duplicate: tc('Duplicate', 'upload'),
  problem: tc('Problem', 'upload'),
  selected: tc('Selected', 'upload'),
  options: tc('Options', 'upload'),
  items: tc('Items', 'upload'),
  explanation: tc('Explanation', 'upload'),
  error: tc('error', 'upload'),
  warning: tc('warning', 'upload'),
};

const DIFFICULTY_LABELS: Record<string, string> = { easy: t('Easy'), medium: t('Medium'), hard: t('Hard') };

const isUploadType = (type: TdContentType | undefined): type is UploadQuestionType => TD_UPLOAD_TYPES.includes(type as UploadQuestionType);

const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

const ISSUE_TITLES: Record<RowIssue['code'], string> = {
  invalid: t('Not valid'),
  duplicate: t('Exists already'),
  duplicate_in_batch: t('Repeated in this upload'),
  missing_reference: t('Refers to something that does not exist'),
  rule: t('Not allowed'),
};

const issueText = (issue: RowIssue) => `${ISSUE_TITLES[issue.code]}${issue.path ? ` (${issue.path})` : ''}: ${issue.message}`;

export interface TdBulkUploadDialogProps {
  /** The game mode to open on (the one the Questions page shows). */
  initialType?: TdContentType;
  /** A category's key (Round I, Round III) or label (Practice, Football Logic) to open on. */
  initialCategory?: string | null;
}

export function TdBulkUploadDialog({ initialType, initialCategory }: TdBulkUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // The answer of an upload on its way is not given up by closing.
        if (!next && busy) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          {t('Upload Questions')}
        </Button>
      </DialogTrigger>
      <DialogContent className="!max-w-6xl overflow-hidden flex flex-col p-6" style={{ maxHeight: '95vh', height: '95vh' }}>
        <UploadBody initialType={initialType} initialCategory={initialCategory ?? null} onBusy={setBusy} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Everything inside the dialog; it exists only while the dialog is open, so closing resets it. */
function UploadBody({ initialType, initialCategory, onBusy, onClose }: { initialType?: TdContentType; initialCategory: string | null; onBusy: (busy: boolean) => void; onClose: () => void }) {
  const { user } = useTdAuth();
  const write = useTdWrite();
  const [selectedQuestionType, setSelectedQuestionType] = useState<UploadQuestionType>(isUploadType(initialType) ? initialType : TYPE_OPTIONS[0]!.value);
  // The category's key (Round I, Round III) or label (Practice, Football Logic); NEW: the one typed below.
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory ?? '');
  const [newCategory, setNewCategory] = useState('');
  const [selectedPuzzle, setSelectedPuzzle] = useState('');
  const [newPuzzle, setNewPuzzle] = useState('');
  const uploadInFlightRef = useRef(false);
  const [state, setState] = useState<UploadState>({ parseErrors: [], isUploading: false });
  const [questions, setQuestions] = useState<ParsedRow[]>([]);
  const [unselected, setUnselected] = useState<Set<string>>(new Set());
  // What the check said, by the import item it was asked of: an item changed by a choice is asked again, one removed from the list is not.
  const [checked, setChecked] = useState<Map<string, RowIssue[]>>(new Map());
  const [uploadCount, setUploadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Counts every choosing of a file: one still being read for an earlier choice is dropped.
  const reading = useRef(0);
  // The choosing the list comes from, and the one whose earlier import has been looked for.
  const [read, setRead] = useState(0);
  const [replayed, setReplayed] = useState(0);
  const replayStarted = useRef(0);
  const readOperation = useRef<TdOperation | null>(null);
  const checking = useRef(false);

  const type = selectedQuestionType;
  const keyCategory = type === 'cards' || type === 'box-questions';
  const labelCategory = type === 'practice-questions' || type === 'football-logic';
  const daily = type === 'football-logic' || type === 'put-in-order' || type === 'career-path';

  const categoryRows = useTdAllRows(type === 'cards' ? 'card-categories' : 'box-categories', { status: STATUSES }, keyCategory);
  const practiceRows = useTdAllRows('practice-questions', { status: STATUSES }, type === 'practice-questions');
  const logicRows = useTdAllRows('football-logic', { status: STATUSES }, type === 'football-logic');
  const orderRows = useTdAllRows('put-in-order', { status: STATUSES }, type === 'put-in-order');
  const careerRows = useTdAllRows('career-path', { status: STATUSES }, type === 'career-path');
  const clubRows = useTdAllRows('clubs', { status: STATUSES }, type === 'career-path');
  const mediaRows = useTdAllRows('media', { status: STATUSES }, type === 'cards' || type === 'practice-questions');

  const categoryOptions = useMemo(() => {
    if (keyCategory) return (categoryRows.data?.rows ?? []).map((row) => ({ value: row.data.key, label: 'prompt' in row.data ? row.data.prompt : row.data.title }));
    const rows = type === 'practice-questions' ? practiceRows.data?.rows : type === 'football-logic' ? logicRows.data?.rows : undefined;
    const labels = new Set((rows ?? []).map((row) => row.data.category).filter(Boolean));
    if (selectedCategory && selectedCategory !== NEW) labels.add(selectedCategory);
    return [...labels].sort((a, b) => a.localeCompare(b)).map((label) => ({ value: label, label }));
  }, [keyCategory, type, categoryRows.data, practiceRows.data, logicRows.data, selectedCategory]);

  const puzzleOptions = useMemo(() => {
    const rows = type === 'football-logic' ? logicRows.data?.rows : type === 'put-in-order' ? orderRows.data?.rows : type === 'career-path' ? careerRows.data?.rows : undefined;
    const byKey = new Map<string, { questions: number; playable: boolean }>();
    for (const row of rows ?? []) {
      const add = (key: string, playable: boolean, counts: boolean) => {
        const found = byKey.get(key) ?? { questions: 0, playable: false };
        byKey.set(key, { questions: found.questions + (counts ? 1 : 0), playable: found.playable || playable });
      };
      add(String(row.data.puzzle), false, true);
      if (row.approvedVersion !== null && row.approved) add(String(row.approved.puzzle), true, false);
    }
    return [...byKey.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([puzzle, found]) => ({
        value: puzzle,
        label: found.playable
          ? tn(found.questions, '{puzzle} · {count} question', '{puzzle} · {count} questions', { puzzle })
          : tn(found.questions, '{puzzle} · {count} question · none approved', '{puzzle} · {count} questions · none approved', { puzzle }),
      }));
  }, [type, logicRows.data, orderRows.data, careerRows.data]);

  const clubs = useMemo<TdClubRef[]>(() => (clubRows.data?.rows ?? []).map((row) => ({ key: row.data.key, label: row.data.label, value: row.data.value })), [clubRows.data]);
  const mediaByKey = useMemo(() => {
    const found = new Map<string, { uploadId: string | null; url: string | null }>();
    for (const row of mediaRows.data?.rows ?? []) {
      const image = releasedImage(row);
      found.set(row.data.key, { uploadId: image.uploadId || null, url: image.url });
    }
    return found;
  }, [mediaRows.data]);

  const category = selectedCategory === NEW ? newCategory.trim() : selectedCategory;
  const puzzle = selectedPuzzle === NEW ? newPuzzle.trim() : selectedPuzzle;
  const categoryProblem = selectedCategory === NEW && newCategory !== '' && (category.length === 0 || category.length > 200) ? t('At most {max} characters, with no spaces at the start or end', { max: 200 }) : null;
  const puzzleProblem = selectedPuzzle === NEW && newPuzzle !== '' && !KEY_PATTERN.test(puzzle) ? t('Lower-case letters, digits, - and _ (starting with a letter or digit), at most 64') : null;
  const ready =
    (!keyCategory && !labelCategory ? true : keyCategory ? category !== '' : category !== '' && category.length <= 200) &&
    (!daily || KEY_PATTERN.test(puzzle)) &&
    (type !== 'career-path' || !clubRows.isLoading);

  const context = useMemo<TdUploadContext>(
    () => ({ categoryKey: keyCategory ? category : '', category: labelCategory ? category : '', puzzle: daily ? puzzle : '', clubs }),
    [keyCategory, labelCategory, daily, category, puzzle, clubs],
  );
  const entries = useMemo(
    () =>
      ready
        ? questions.map((question) => {
            const item = toTdImportItem(question, context);
            return { item, signature: canonicalJson(item) };
          })
        : [],
    [ready, questions, context],
  );
  // More than an import takes is not checked: it is shortened first.
  const tooMany = entries.length > TD_IMPORT_MAX_ITEMS;
  const pending = useMemo(() => (tooMany ? [] : entries.filter((entry) => !checked.has(entry.signature))), [tooMany, entries, checked]);

  const rows = useMemo<QuestionWithSelection[]>(
    () =>
      questions.map((question, index) => {
        const signature = entries[index]?.signature ?? null;
        const issues = signature ? (checked.get(signature) ?? []) : [];
        const isDuplicate = issues.some((issue) => issue.code === 'duplicate');
        return {
          question,
          // A question that already exists cannot be uploaded, so it is never selected.
          isSelected: !unselected.has(question.id) && !isDuplicate,
          isDuplicate,
          problems: isDuplicate ? [] : issues,
          checked: signature !== null && checked.has(signature),
        };
      }),
    [questions, entries, checked, unselected],
  );

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.txt')) {
      toast.error(t('Please select a .txt file'));
      return;
    }

    // Validate file size
    if (file.size > TD_IMPORT_MAX_BYTES) {
      toast.error(t('File size must be less than {mb} MB', { mb: Math.round(MAX_MB) }));
      return;
    }

    const mine = ++reading.current;
    // Begun before reading, so a replay cannot go out under a sign-in made meanwhile.
    readOperation.current = user && tdTokens.read()?.staffId === user.id ? beginOperation(tdTokens) : null;

    let content: string;
    try {
      content = await readFile(file);
    } catch {
      toast.error(t('Failed to read file'));
      return;
    }
    if (reading.current !== mine) return;

    const result = parseTdUpload(content, selectedQuestionType);
    setState((prev) => ({ ...prev, parseErrors: result.errors }));
    setPreviewIndex(null);

    if (result.questions.length === 0) {
      setQuestions([]);
      toast.error(t('No valid questions found in file'));
      return;
    }

    // Initialize with all questions selected
    setQuestions(result.questions.map((q, idx) => ({ ...q, id: `${q.questionNumber}-${q.lineNumber}-${idx}` })));
    setUnselected(new Set());
    setPage(1);
    setRead(mine);
    // A file with errors imports nothing, so there is no earlier import to look for.
    const errorCount = result.errors.filter((error) => error.severity === 'error').length;
    const warningCount = result.errors.length - errorCount;
    if (errorCount > 0 || !readOperation.current) setReplayed(mine);

    if (result.errors.length > 0) {
      toast.warning(
        t('Read {n} questions: {errors}, {warnings}', {
          n: result.questions.length,
          errors: tn(errorCount, '{count} error', '{count} errors'),
          warnings: tn(warningCount, '{count} warning', '{count} warnings'),
        }),
      );
    } else {
      toast.success(tn(result.questions.length, 'Read {count} question', 'Read {count} questions'));
    }
  };

  const handleRemoveQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  /** The answers of a refused import, row by row, for the items it was sent. */
  const absorb = useCallback((items: unknown[], report: ContentImportReport) => {
    setChecked((prev) => {
      const next = new Map(prev);
      items.forEach((item, index) => next.set(canonicalJson(item), report.rows.find((row) => row.index === index)?.issues ?? []));
      return next;
    });
  }, []);

  /** Imports the items as drafts, all or none, under the batch key of exactly these items. */
  const importItems = useCallback(
    async (items: unknown[], replay?: TdOperation): Promise<'done' | 'spent' | 'failed'> => {
      if (!user) return 'failed';
      const hash = await sha256Hex(canonicalJson(items));
      const saved = batchKeyFor(user.id, hash);
      markSent(user.id, hash, true);
      setUploadCount(items.length);
      setState((prev) => ({ ...prev, isUploading: true }));
      onBusy(true);
      try {
        const out = await write((operation) => tdAdmin.imports.apply(saved.key, items, operation), [tdKeys.content, tdKeys.releases, tdKeys.imports], replay);
        if (!out.created && out.batch.status !== 'applied') {
          // Imported before and undone since: this key is spent.
          retireBatchKey(user.id, saved.key);
          return 'spent';
        }
        toast.success(out.created ? t('{n} drafts imported', { n: out.batch.rows.length }) : t('These items were imported already; nothing was added'));
        onClose();
        return 'done';
      } catch (caught) {
        // Refused, so nothing was imported under this key.
        if (caught instanceof TdApiError && (caught.code === 'validation' || caught.code === 'conflict')) markSent(user.id, hash, false);
        // A check that passed can still lose a race: the API answers with the whole report.
        if (caught instanceof TdApiError && caught.code === 'validation' && caught.details && typeof caught.details === 'object' && 'rows' in caught.details) {
          absorb(items, caught.details as ContentImportReport);
        }
        toast.error(tdErrorText(caught));
        return 'failed';
      } finally {
        onBusy(false);
        setState((prev) => ({ ...prev, isUploading: false }));
      }
    },
    [user, write, onBusy, onClose, absorb],
  );

  // The items of a file read again went out once without a final answer: asked with the saved key first, since a check
  // would count that import's own rows as duplicates. The API answers with that batch, or imports what the member confirmed.
  useEffect(() => {
    if (read === 0 || replayed === read || replayStarted.current === read || !ready || entries.length === 0) return;
    replayStarted.current = read;
    const mine = read;
    const operation = readOperation.current;
    void (async () => {
      const items = entries.map((entry) => entry.item);
      const saved = user && operation ? batchKeyFor(user.id, await sha256Hex(canonicalJson(items))) : null;
      if (saved?.sent && operation) {
        const outcome = await importItems(items, operation);
        if (outcome === 'done') return;
      }
      setReplayed(mine);
    })();
  }, [read, replayed, ready, entries, user, importItems]);

  // The check: which of the questions the API would refuse, asked once for each item.
  useEffect(() => {
    if (!ready || read === 0 || replayed !== read || pending.length === 0 || checking.current) return;
    checking.current = true;
    const asked = pending;
    void (async () => {
      try {
        const report = await write((operation) => tdAdmin.imports.preview(asked.map((entry) => entry.item), operation), []);
        checking.current = false;
        setChecked((prev) => {
          const next = new Map(prev);
          asked.forEach((entry, index) => next.set(entry.signature, report.rows.find((row) => row.index === index)?.issues ?? []));
          return next;
        });
      } catch {
        checking.current = false;
        toast.error(t('Failed to check the questions. You can still proceed with upload.'));
        // Keep all questions selected on error
        setChecked((prev) => {
          const next = new Map(prev);
          asked.forEach((entry) => next.set(entry.signature, []));
          return next;
        });
      }
    })();
  }, [ready, read, replayed, pending, write]);

  const handleUpload = async () => {
    if (uploadInFlightRef.current || state.isUploading) {
      return;
    }

    const selectedRows = rows.flatMap((row, index) => (row.isSelected ? [index] : []));

    if (selectedRows.length === 0) {
      toast.error(t('No questions selected for upload'));
      return;
    }

    if (!ready) {
      toast.error(keyCategory || labelCategory ? t('Please select a category') : t('Please select a puzzle'));
      return;
    }

    const items = selectedRows.map((index) => entries[index]!.item);
    const tooBig = tdImportLimits(items);
    if (tooBig.length > 0) {
      toast.error(tooBig[0]!.message);
      return;
    }

    uploadInFlightRef.current = true;
    try {
      let outcome = await importItems(items);
      // These very items were imported once and that import was undone: its key is spent, so they are imported anew under a fresh one.
      if (outcome === 'spent') outcome = await importItems(items);
      if (outcome === 'spent') toast.error(t('These items were imported before and that import was undone. Read the file again to import them anew.'));
    } finally {
      uploadInFlightRef.current = false;
    }
  };

  const clearFile = () => {
    reading.current += 1;
    setState({ parseErrors: [], isUploading: false });
    setQuestions([]);
    setUnselected(new Set());
    setPreviewIndex(null);
    setPage(1);
    setRead(0);
    setReplayed(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleTypeChange = (next: UploadQuestionType) => {
    setSelectedQuestionType(next);
    setSelectedCategory('');
    setNewCategory('');
    setSelectedPuzzle('');
    setNewPuzzle('');
    clearFile();
  };

  // Computed values
  const selectedCount = rows.filter((row) => row.isSelected).length;
  const duplicateCount = rows.filter((row) => row.isDuplicate).length;
  const problemCount = rows.filter((row) => row.problems.length > 0).length;
  const selectedProblemCount = rows.filter((row) => row.isSelected && row.problems.length > 0).length;
  const parseErrorCount = state.parseErrors.filter((error) => error.severity === 'error').length;
  const parseWarningCount = state.parseErrors.filter((error) => error.severity === 'warning').length;
  const isChecking = ready && questions.length > 0 && (replayed !== read || pending.length > 0);
  const canUpload = ready && selectedCount > 0 && !state.isUploading && !isChecking && parseErrorCount === 0 && selectedProblemCount === 0;
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageQuestions = rows.slice(pageStart, pageStart + PAGE_SIZE);
  const showsLevel = type === 'practice-questions' || type === 'cards';

  return (
    <>
      <DialogHeader className="flex-shrink-0 pb-4">
        <DialogTitle>{t('Bulk Upload Questions')}</DialogTitle>
        <DialogDescription>
          {state.isUploading
            ? tn(uploadCount, 'Creating {count} question…', 'Creating {count} questions…')
            : isChecking
              ? tn(questions.length, 'Checking {count} question…', 'Checking {count} questions…')
              : t('Upload a .txt file with multiple questions to create them all at once. Maximum {max} questions per upload.', { max: TD_IMPORT_MAX_ITEMS })}
        </DialogDescription>
      </DialogHeader>

      {state.isUploading ? (
        <div className="flex-1 flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {/* Question Type Selection */}
          <div className="space-y-2">
            <Label htmlFor="question-type">{t('Question Type')} *</Label>
            <Select value={selectedQuestionType} onValueChange={(value: UploadQuestionType) => handleTypeChange(value)}>
              <SelectTrigger id="question-type">
                <SelectValue placeholder={t('Select a question type')} />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">{t('Controls the parser and saved question payload.')}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {/* Category Selection */}
            {(keyCategory || labelCategory) && (
              <div className="space-y-2">
                <Label htmlFor="category">{t('Category')} *</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger id="category" className="max-w-full">
                    <SelectValue placeholder={t('Select a category')} />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                    {labelCategory && <SelectItem value={NEW}>{t('New category…')}</SelectItem>}
                    {keyCategory && categoryOptions.length === 0 && (
                      <SelectItem value="none" disabled>
                        {categoryRows.isLoading ? t('Loading categories...') : t('No categories available')}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {selectedCategory === NEW && <Input aria-label={t('New category')} value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder={t('Category')} />}
                {categoryProblem && <p className="text-sm text-destructive">{categoryProblem}</p>}
              </div>
            )}

            {/* Puzzle (set) Selection */}
            {daily && (
              <div className="space-y-2">
                <Label htmlFor="puzzle">{t('Puzzle (set)')} *</Label>
                <Select value={selectedPuzzle} onValueChange={setSelectedPuzzle}>
                  <SelectTrigger id="puzzle" className="max-w-full">
                    <SelectValue placeholder={t('Select a puzzle')} />
                  </SelectTrigger>
                  <SelectContent>
                    {puzzleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={NEW}>{t('New puzzle…')}</SelectItem>
                  </SelectContent>
                </Select>
                {selectedPuzzle === NEW && <Input aria-label={t('New puzzle key')} value={newPuzzle} onChange={(event) => setNewPuzzle(event.target.value)} placeholder="fl-12" />}
                {puzzleProblem && <p className="text-sm text-destructive">{puzzleProblem}</p>}
              </div>
            )}

            {/* File Input */}
            <div className="space-y-2">
              <Label htmlFor="file">{t('Question File')} *</Label>
              <Input
                ref={fileInputRef}
                id="file"
                type="file"
                accept=".txt"
                onChange={handleFileSelect}
                // Chosen again after a fix, the same file is read again.
                onClick={(event) => {
                  event.currentTarget.value = '';
                }}
              />
              <p className="text-sm text-muted-foreground">{t('Upload a .txt file (max {mb} MB)', { mb: Math.round(MAX_MB) })}</p>
            </div>
          </div>

          {/* Format Instructions */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                <div className="flex-1 space-y-3">
                  <h4 className="font-semibold text-base">{t('File Format')}</h4>
                  <div className="text-sm space-y-3">
                    <div>
                      <p className="font-medium mb-2">{t('Required format for each question:')}</p>
                      <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto border border-border">{TD_UPLOAD_EXAMPLES[selectedQuestionType]}</pre>
                      {FORMAT_NOTES[selectedQuestionType]?.map((note) => (
                        <p key={note} className="mt-2 text-xs leading-5 text-muted-foreground">
                          {note}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Parse Errors */}
          {state.parseErrors.length > 0 && (
            <Alert variant={parseErrorCount > 0 ? 'destructive' : 'default'} className={cn(parseErrorCount === 0 && 'border-amber-500 bg-amber-50')}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium mb-2">
                  {tn(state.parseErrors.length, 'Found {count} issue in file', 'Found {count} issues in file')}
                  {parseWarningCount > 0 && ` (${tn(parseWarningCount, '{count} warning', '{count} warnings')})`}
                  {parseErrorCount > 0 && ` (${tn(parseErrorCount, '{count} error', '{count} errors')})`}:
                </div>
                {parseErrorCount > 0 && <p className="mb-2 text-sm">{t('Fix the file and choose it again: nothing is uploaded while it has errors.')}</p>}
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {state.parseErrors.slice(0, 5).map((err, i) => (
                    <li key={i}>
                      <span className="font-medium capitalize">{err.severity === 'error' ? WORDS.error : WORDS.warning}</span>: {t('Line {line}', { line: err.lineNumber })}
                      {err.questionNumber && ` (${t('Question {n}', { n: err.questionNumber })})`}: {err.message}
                    </li>
                  ))}
                  {state.parseErrors.length > 5 && <li>{t('...and {n} more', { n: state.parseErrors.length - 5 })}</li>}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Summary Alert */}
          {rows.length > 0 && (
            <Alert className={cn('flex items-start justify-between gap-4', duplicateCount > 0 || problemCount > 0 || parseErrorCount > 0 ? 'border-amber-500 bg-amber-50' : 'border-green-500 bg-green-50')}>
              <div className="flex-1">
                <AlertDescription>
                  <div className="space-y-1">
                    <p className="font-semibold">{tn(selectedCount, '{count} question selected for upload', '{count} questions selected for upload')}</p>
                    {duplicateCount > 0 && <p className="text-sm text-muted-foreground">{tn(duplicateCount, '{count} duplicate found and unselected', '{count} duplicates found and unselected')}</p>}
                    {problemCount > 0 && (
                      <p className="text-sm text-muted-foreground">{tn(problemCount, '{count} question has a problem: remove it or fix the file', '{count} questions have problems: remove them or fix the file')}</p>
                    )}
                  </div>
                </AlertDescription>
              </div>
            </Alert>
          )}

          {/* Preview Table */}
          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">{t('Parsed Questions ({n})', { n: rows.length })}</Label>
                {rows.length > TD_IMPORT_MAX_ITEMS && <Badge variant="destructive">{t('Maximum {max} questions allowed', { max: TD_IMPORT_MAX_ITEMS })}</Badge>}
              </div>
              <div className="border rounded-lg max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        {(() => {
                          const allSelected = rows.every((q) => q.isSelected || q.isDuplicate);
                          const someSelected = rows.some((q) => q.isSelected);
                          return (
                            <Checkbox
                              aria-label={t('Select all shown')}
                              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                              onCheckedChange={(next: boolean | 'indeterminate') => {
                                setUnselected(next === true ? new Set() : new Set(rows.map((q) => q.question.id)));
                              }}
                            />
                          );
                        })()}
                      </TableHead>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>{t('Question')}</TableHead>
                      {showsLevel && <TableHead className="w-24">{type === 'cards' ? t('Points') : t('Difficulty')}</TableHead>}
                      <TableHead className="w-32">{t('Status')}</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageQuestions.map((q, rowIndex) => (
                      <TableRow key={q.question.id} className={cn('cursor-pointer hover:bg-muted/50', !q.isSelected && 'opacity-50')} onClick={() => setPreviewIndex(pageStart + rowIndex)}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            aria-label={t('Select {label}', { label: tdQuestionSummary(q.question) })}
                            checked={q.isSelected}
                            disabled={q.isDuplicate}
                            onCheckedChange={(next: boolean | 'indeterminate') => {
                              setUnselected((prev) => {
                                const updated = new Set(prev);
                                if (next === true) updated.delete(q.question.id);
                                else updated.add(q.question.id);
                                return updated;
                              });
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{q.question.questionNumber}</TableCell>
                        <TableCell className="max-w-md truncate">{tdQuestionSummary(q.question)}</TableCell>
                        {showsLevel && (
                          <TableCell>
                            <Badge variant="outline">
                              {q.question.kind === 'cards' ? tn(q.question.points, '{count} point', '{count} points') : q.question.kind === 'practice-questions' ? DIFFICULTY_LABELS[q.question.difficulty] : null}
                            </Badge>
                          </TableCell>
                        )}
                        <TableCell>
                          {q.isDuplicate ? (
                            <div className="space-y-1">
                              <Badge variant="destructive" className="text-xs">
                                {WORDS.duplicate}
                              </Badge>
                              <p className="text-xs text-muted-foreground">{t('Exists already')}</p>
                            </div>
                          ) : q.problems.length > 0 ? (
                            <div className="space-y-1">
                              <Badge variant="destructive" className="text-xs">
                                {WORDS.problem}
                              </Badge>
                              <p className="line-clamp-2 text-xs text-muted-foreground" title={q.problems.map(issueText).join('\n')}>
                                {issueText(q.problems[0]!)}
                              </p>
                            </div>
                          ) : ready && !tooMany && !q.checked ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              {t('New')}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" aria-label={t('Remove')} onClick={() => handleRemoveQuestion(q.question.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">{t('Page {page} of {total}', { page: currentPage, total: totalPages })}</div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                      {t('Previous')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                      {t('Next')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Question Preview Dialog */}
      {previewIndex !== null && rows[previewIndex] && (
        <ParsedQuestionPreviewDialog
          row={rows[previewIndex]}
          currentIndex={previewIndex}
          totalQuestions={rows.length}
          clubs={clubs}
          clubsLoaded={!clubRows.isLoading}
          media={mediaByKey}
          mediaLoaded={!mediaRows.isLoading}
          onClose={() => setPreviewIndex(null)}
          onNavigate={setPreviewIndex}
        />
      )}

      <DialogFooter className="flex-shrink-0 border-t pt-4 mt-4">
        <Button variant="outline" onClick={onClose} disabled={state.isUploading}>
          {t('Cancel')}
        </Button>
        <Button onClick={handleUpload} disabled={!canUpload || selectedCount > TD_IMPORT_MAX_ITEMS}>
          {state.isUploading ? <>{t('Uploading...')}</> : <>{tn(selectedCount, 'Upload {count} Question', 'Upload {count} Questions')}</>}
        </Button>
      </DialogFooter>
    </>
  );
}

interface ParsedQuestionPreviewDialogProps {
  row: QuestionWithSelection;
  currentIndex: number;
  totalQuestions: number;
  clubs: readonly TdClubRef[];
  clubsLoaded: boolean;
  media: Map<string, { uploadId: string | null; url: string | null }>;
  mediaLoaded: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

/** An image of a question in the preview: an uploaded one by its key, or one by path or web address (the CMS does not load foreign images, so a web address is a link). */
function PreviewImage({ label, reference, media, mediaLoaded }: { label: string; reference: string | null; media?: ParsedQuestionPreviewDialogProps['media']; mediaLoaded?: boolean }) {
  const uploaded = media && reference ? media.get(reference) : undefined;
  const isUrl = reference?.startsWith('https://') || reference?.startsWith('http://');
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1 flex items-center gap-3">
        {reference ? (
          <>
            <TdMediaThumb uploadId={uploaded?.uploadId} url={isUrl ? reference : uploaded?.url} alt={reference} className="h-24 w-36" />
            <div className="min-w-0 text-sm">
              <p className="break-all font-mono text-xs">{reference}</p>
              {media && mediaLoaded && !uploaded && <p className="mt-1 text-xs text-destructive">{t('No uploaded image has this key')}</p>}
            </div>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

function ParsedQuestionPreviewDialog({ row, currentIndex, totalQuestions, clubs, clubsLoaded, media, mediaLoaded, onClose, onNavigate }: ParsedQuestionPreviewDialogProps) {
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < totalQuestions - 1;
  const question = row.question;
  const aliases = 'aliases' in question ? question.aliases : [];

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && hasPrevious) {
        e.preventDefault();
        onNavigate(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        onNavigate(currentIndex + 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, hasPrevious, hasNext, onNavigate, onClose]);

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="flex max-h-[92vh] w-[min(92vw,760px)] max-w-none flex-col overflow-hidden p-0" aria-describedby={undefined} onClick={(e) => e.stopPropagation()}>
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
          <div className="flex items-center justify-between">
            <DialogTitle>{t('Question Preview')}</DialogTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('{n} of {total}', { n: currentIndex + 1, total: totalQuestions })}</span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={t('Previous')}
                  disabled={!hasPrevious}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (hasPrevious) onNavigate(currentIndex - 1);
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={t('Next')}
                  disabled={!hasNext}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (hasNext) onNavigate(currentIndex + 1);
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-5 py-4">
          {/* Header with badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {question.kind === 'practice-questions' && (
              <Badge variant="outline" className={cn('border', getDifficultyVariant(question.difficulty))}>
                {DIFFICULTY_LABELS[question.difficulty]}
              </Badge>
            )}
            {question.kind === 'cards' && <Badge variant="outline">{tn(question.points, '{count} point', '{count} points')}</Badge>}
            <Badge variant="outline">{TYPE_OPTIONS.find((option) => option.value === question.kind)?.label}</Badge>
            {row.isDuplicate ? (
              <Badge variant="destructive">{WORDS.duplicate}</Badge>
            ) : row.problems.length > 0 ? (
              <Badge variant="destructive">{WORDS.problem}</Badge>
            ) : (
              <Badge variant="outline" className="text-green-600 border-green-600">
                {t('New')}
              </Badge>
            )}
            {row.isSelected ? <Badge variant="default">{WORDS.selected}</Badge> : <Badge variant="secondary">{t('Not Selected')}</Badge>}
          </div>

          {/* Question Prompt */}
          <div>
            <Label className="text-xs text-muted-foreground">{t('Question #{n}', { n: question.questionNumber })}</Label>
            <p className="text-sm font-medium mt-1">{tdQuestionSummary(question)}</p>
          </div>

          {(question.kind === 'cards' || question.kind === 'whoami-subjects') && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground">{t('Clues ({n})', { n: question.clues.length })}</Label>
                <div className="space-y-2 mt-1">
                  {question.clues.map((clue, index) => (
                    <div key={index} className="rounded-lg border bg-gray-50 p-3 text-sm">
                      <span className="font-medium">{t('Clue {n}:', { n: index + 1 })}</span> {clue}
                    </div>
                  ))}
                </div>
              </div>
              {question.kind === 'cards' && question.imageKey && <PreviewImage label={t('Image')} reference={question.imageKey} media={media} mediaLoaded={mediaLoaded} />}
              {question.kind === 'cards' && question.photo && (
                <div>
                  <Label className="text-xs text-muted-foreground">{t('SoFIFA face')}</Label>
                  <p className="text-sm mt-1">{t('{id} · version {ver}', { id: question.photo.id, ver: question.photo.ver })}</p>
                </div>
              )}
            </>
          )}

          {(question.kind === 'box-questions' || question.kind === 'penalty-questions') && (
            <div>
              <Label className="text-xs text-muted-foreground">{t('Answer')}</Label>
              <div className="mt-1 rounded-lg border bg-gray-50 p-3 text-sm font-medium">{question.display}</div>
            </div>
          )}

          {question.kind === 'practice-questions' && (
            <>
              {question.imageKey && <PreviewImage label={t('Image')} reference={question.imageKey} media={media} mediaLoaded={mediaLoaded} />}

              <div>
                <Label className="text-xs text-muted-foreground">{WORDS.options}</Label>
                <div className="space-y-2 mt-1">
                  {question.options.map((option, index) => (
                    <div key={index} className={cn('flex min-w-0 items-center gap-2 rounded-lg border p-3 text-sm', option.isCorrect ? 'bg-green-50 border-green-200' : 'border-gray-200 bg-gray-50')}>
                      <span className="font-semibold">{option.letter})</span>
                      <span className="min-w-0 flex-1 break-words">{option.text}</span>
                      {option.isCorrect && <CheckCircle2 className="ml-auto h-4 w-4 text-green-600" />}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {question.kind === 'football-logic' && (
            <>
              <PreviewImage label={t('Image A')} reference={question.imageA} />
              <PreviewImage label={t('Image B')} reference={question.imageB} />
              <div>
                <Label className="text-xs text-muted-foreground">{t('Answer')}</Label>
                <div className="mt-1 rounded-lg border bg-gray-50 p-3 text-sm font-medium">{question.display}</div>
              </div>
            </>
          )}

          {question.kind === 'put-in-order' && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground">{WORDS.items}</Label>
                <div className="space-y-2 mt-1">
                  {question.items.map((item, index) => (
                    <div key={index} className="rounded-lg border bg-gray-50 p-3 text-sm">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t('Right order')}</Label>
                <div className="space-y-2 mt-1">
                  {question.order.map((item, index) => (
                    <div key={index} className="rounded-lg border bg-green-50 p-3 text-sm">
                      {index + 1}. {item}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {question.kind === 'career-path' && (
            <div>
              <Label className="text-xs text-muted-foreground">{t('Clubs ({n})', { n: question.clubs.length })}</Label>
              <div className="space-y-2 mt-1">
                {careerClubs(question, clubs).map((club, index) => (
                  <div key={index} className="flex min-w-0 items-center gap-2 rounded-lg border bg-gray-50 p-3 text-sm">
                    <span className="font-medium">{index + 1}.</span>
                    <span className="min-w-0 flex-1 break-words">{club.name}</span>
                    {clubsLoaded && (club.clubKey ? <span className="font-mono text-xs text-muted-foreground">{club.clubKey}</span> : <span className="text-xs text-muted-foreground">{t('No crest')}</span>)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {aliases.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">{t('Accepted spellings')}</Label>
              <p className="text-sm mt-1">{aliases.join(' | ')}</p>
            </div>
          )}

          {/* Explanation */}
          {question.kind === 'practice-questions' && question.explanation && (
            <div>
              <Label className="text-xs text-muted-foreground">{WORDS.explanation}</Label>
              <p className="text-sm text-muted-foreground mt-1">{question.explanation}</p>
            </div>
          )}

          {/* Duplicate Info */}
          {row.isDuplicate && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium">{t('This question already exists.')}</p>
              </AlertDescription>
            </Alert>
          )}

          {/* Problems */}
          {row.problems.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium">{t('This question has problems:')}</p>
                <ul className="mt-1 list-disc list-inside space-y-1 text-sm">
                  {row.problems.map((issue, index) => (
                    <li key={index}>{issueText(issue)}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
