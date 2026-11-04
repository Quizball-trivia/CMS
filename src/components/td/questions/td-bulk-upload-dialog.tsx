'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Info, Link2, Loader2, Trash2, Upload } from 'lucide-react';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { TdDialogContent } from '@/components/td/td-dialog';
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
import { cardFaceSrc } from '@/components/td/content/td-card-image';
import { releasedImage, TdMediaThumb, uploadProblem } from '@/components/td/media/td-media';
import { tdKeys, useTdAllRows, useTdWrite } from '@/hooks/use-td-content';
import type { TdContentRow, TdContentType } from '@/lib/td/admin-api';
import { withShownAnswer } from '@/lib/td/answers';
import { findImage } from '@/lib/td/images';
import { SESSION_CHANGED, TdApiError } from '@/lib/td/api-client';
import { tdAdmin, tdTokens } from '@/lib/td/client';
import type { ContentImportReport } from '@/lib/td/contract';
import { contentWriteIssues } from '@/lib/td/content-rules';
import { tdApiMessage, tdErrorText } from '@/lib/td/errors';
import { canonicalJson, sha256Hex } from '@/lib/td/hash';
import { t, tc, tn } from '@/lib/td/i18n';
import { TD_IMPORT_MAX_BYTES, TD_IMPORT_MAX_ITEMS, tdImportLimits, toItem } from '@/lib/td/import-format';
import { batchKeyFor, markSent, retireBatchKey } from '@/lib/td/import-keys';
import { downloadLinkPicture, linkPictureReason, type LinkPictureFailure } from '@/lib/td/link-pictures';
import { beginOperation, operationIsCurrent, type TdOperation } from '@/lib/td/operation';
import {
  categoryName,
  imageKeyIn,
  isPictureLink,
  newBoxCategoryKey,
  parseTdUpload,
  pictureFilesOf,
  pictureName,
  QUESTION_START,
  TD_UPLOAD_EXAMPLES,
  tdQuestionSummary,
  toTdImportItem,
  type ParsedCard,
  type TdParseError,
  type TdParsedQuestion,
  type TdUploadContext,
  type TdUploadType,
} from '@/lib/td/upload-format';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';

/** The dailies ship with the game's code (contract 12): only the match rounds and practice are uploaded here. */
type UploadQuestionType = Exclude<TdUploadType, 'football-logic' | 'put-in-order' | 'career-path'>;
type UploadedQuestion = Extract<TdParsedQuestion, { kind: UploadQuestionType }>;

type RowIssue = ContentImportReport['rows'][number]['issues'][number];

type ParsedRow = UploadedQuestion & { id: string };

interface UploadState {
  parseErrors: TdParseError[];
  /** The file's lines, to show the question an error is about. */
  lines?: string[];
  isUploading: boolean;
}

/** The question around a line of the file: from its numbered first line (or a blank line) to the next question
 *  (or blank line); questions need no blank line between them. */
function questionLines(lines: readonly string[], lineNumber: number): string[] {
  const starts = (i: number) => QUESTION_START.test(lines[i]!.trim());
  const at = Math.min(Math.max(lineNumber - 1, 0), lines.length - 1);
  let from = at;
  while (from > 0 && !starts(from) && lines[from - 1]!.trim()) from--;
  let to = at + 1;
  while (to < lines.length && lines[to]!.trim() && !starts(to)) to++;
  // A long one is cut around the line the error names.
  const first = Math.max(from, at - 20);
  return lines.slice(first, Math.min(to, first + 30));
}

/** What the check says of one question, with where it stands in the list. */
interface QuestionWithSelection {
  question: ParsedRow;
  isSelected: boolean;
  isDuplicate: boolean;
  problems: RowIssue[];
  /** The check has answered for the import item this question becomes. */
  checked: boolean;
  /** A card already in the category with this answer: the question updates it instead of adding another. */
  updates: TdContentRow<'cards'> | null;
}

/** A picture chosen with the file, or downloaded from a link the file gives (its name is then the link): saved as an
 *  image under a key made from its bytes, so the same picture is one image. */
interface Picture {
  name: string;
  file: File;
  key: string;
  url: string;
  /** The link it was downloaded from, kept as the image's source. */
  source: string | null;
}

/** A link's picture while it downloads, or why it could not be. */
type LinkState = { status: 'loading' } | { status: 'failed'; reason: LinkPictureFailure };

const LINK_DOWNLOADS_AT_ONCE = 2;
// How long a check the API refused as too many waits before it is asked again.
const CHECK_RETRY_MS = 5_000;
// The API takes 30 pictures a minute from a member (UPLOADS_PER_MINUTE): one refused as too many waits and goes again.
const PICTURE_RETRY_MS = 10_000;
const PICTURE_RETRIES = 12;

/** Why a question's picture is not there yet: not chosen, still downloading, or not downloadable. */
function missingPictureText(name: string, state: LinkState | undefined): string {
  if (!isPictureLink(name)) return t('Choose the picture {name} under Pictures', { name });
  if (state?.status === 'failed') return t('The picture at its link could not be downloaded: {reason}', { reason: linkPictureReason(state.reason) });
  return t('Downloading the picture from its link…');
}

const plainName = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const NEW = '__new__';
const MAX_MB = TD_IMPORT_MAX_BYTES / 1024 / 1024;
const PAGE_SIZE = 100;
// The questions with a problem named in the summary; the list has them all.
const PROBLEMS_LISTED = 10;
const STATUSES = 'draft,ready,approved';

const TYPE_OPTIONS: Array<{ value: UploadQuestionType; label: string }> = [
  { value: 'cards', label: t('Round I · ბარათონი') },
  { value: 'whoami-subjects', label: t('Round II · გამარჯობა') },
  { value: 'box-questions', label: t('Round III · პაპა კარლოს ყუთი') },
  { value: 'penalty-questions', label: t('Penalties') },
  { value: 'practice-questions', label: t('Practice · ივარჯიშე') },
];

const FORMAT_NOTES: Partial<Record<UploadQuestionType, string[]>> = {
  cards: [
    t('Answer: the first name is what the card shows. Add others only for nicknames or a very different spelling: the game already forgives typos, accents, capitals and Georgian or Latin letters, and the surname alone counts.'),
  ],
  'box-questions': [t('Optional: “Category: მუნდიალი” puts the question in that category, and the upload makes the category when there is none of that name. When every question has one, no category needs to be chosen.')],
  'whoami-subjects': [t('Five clues per player, hardest first: a match shows the first 5, one every few seconds, and the first to buzz answers. No points and no pictures in this round.')],
  'practice-questions': [
    t('Optional: “Image: stadium.jpg” is the file name of a picture chosen below under Pictures, “Image: https://…” a link to a picture (the CMS downloads it and keeps its own copy), or the key of an image already uploaded.'),
    t('Optional: “Category: ოქროს ბურთი” gives the question its own category instead of the one chosen above. When every question has one, no category needs to be chosen.'),
  ],
};

/** Single words that other screens may word differently: filed under their own context. */
const WORDS = {
  duplicate: tc('Duplicate', 'upload'),
  problem: tc('Problem', 'upload'),
  selected: tc('Selected', 'upload'),
  options: tc('Options', 'upload'),
  explanation: tc('Explanation', 'upload'),
  error: tc('error', 'upload'),
  warning: tc('warning', 'upload'),
};

const DIFFICULTY_LABELS: Record<string, string> = { easy: t('Easy'), medium: t('Medium'), hard: t('Hard') };

const isUploadType = (type: TdContentType | undefined): type is UploadQuestionType => TYPE_OPTIONS.some((option) => option.value === type);
const isUploaded = (question: TdParsedQuestion): question is UploadedQuestion => TYPE_OPTIONS.some((option) => option.value === question.kind);

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

/** What a card the file names again becomes: the file's points, its clues if it gives any, its spellings added to the card's
 *  own, and its picture (a SoFIFA photo or a picture file) in place of the card's. */
function updatedCard(question: ParsedCard, card: TdContentRow<'cards'>, imageKey: string | null): TdContentRow<'cards'>['data'] {
  return withShownAnswer('cards', {
    ...card.data,
    value: question.points,
    lines: question.clues.length > 0 ? question.clues : card.data.lines,
    aliases: [...card.data.aliases, ...question.aliases].filter((alias, index, all) => all.findIndex((other) => plainName(other) === plainName(alias)) === index),
    photo: question.photo ?? (imageKey ? null : card.data.photo),
    imageKey: imageKey ?? (question.photo ? null : card.data.imageKey),
  });
}

const PICTURE_NAME = /\.(?:jpe?g|png|webp)$/i;

/** A problem's own words: the CMS's, or the API's in the workspace's language (its kind alone when it has none). */
const issueMessage = (issue: RowIssue) => tdApiMessage(issue.message) ?? ISSUE_TITLES[issue.code];
const issueText = (issue: RowIssue) => {
  const said = tdApiMessage(issue.message);
  return `${ISSUE_TITLES[issue.code]}${issue.path ? ` (${issue.path})` : ''}${said ? `: ${said}` : ''}`;
};

export interface TdBulkUploadDialogProps {
  /** The game mode to open on (the one the Questions page shows). */
  initialType?: TdContentType;
  /** A category's key (Round I, Round III) or label (Practice) to open on. */
  initialCategory?: string | null;
  /** The game modes it offers (all by default); with one, no choice is shown. */
  types?: readonly TdContentType[];
}

export function TdBulkUploadDialog({ initialType, initialCategory, types }: TdBulkUploadDialogProps) {
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
      <TdDialogContent className="!max-w-6xl overflow-hidden flex flex-col p-6" style={{ maxHeight: '95vh', height: '95vh' }}>
        <UploadBody open={open} initialType={initialType} initialCategory={initialCategory ?? null} types={types} onBusy={setBusy} onClose={() => setOpen(false)} />
      </TdDialogContent>
    </Dialog>
  );
}

/** Everything inside the dialog; it exists only while the dialog is open, so closing resets it. */
function UploadBody({ open, initialType, initialCategory, types, onBusy, onClose }: { open: boolean; initialType?: TdContentType; initialCategory: string | null; types?: readonly TdContentType[]; onBusy: (busy: boolean) => void; onClose: () => void }) {
  const { user } = useTdAuth();
  const write = useTdWrite();
  const queryClient = useQueryClient();
  const typeOptions = types ? TYPE_OPTIONS.filter((option) => types.includes(option.value)) : TYPE_OPTIONS;
  const [selectedQuestionType, setSelectedQuestionType] = useState<UploadQuestionType>(isUploadType(initialType) && typeOptions.some((o) => o.value === initialType) ? initialType : typeOptions[0]!.value);
  // The category's key (Round I, Round III) or label (Practice); NEW: the one typed below.
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory ?? '');
  const [newCategory, setNewCategory] = useState('');
  const uploadInFlightRef = useRef(false);
  const [state, setState] = useState<UploadState>({ parseErrors: [], isUploading: false });
  const [questions, setQuestions] = useState<ParsedRow[]>([]);
  const [unselected, setUnselected] = useState<Set<string>>(new Set());
  // What the check said, by the import item it was asked of: an item changed by a choice is asked again, one removed from the list is not.
  const [checked, setChecked] = useState<Map<string, RowIssue[]>>(new Map());
  const [uploadCount, setUploadCount] = useState(0);
  // The pictures wait for the API's per-minute limit.
  const [pacing, setPacing] = useState(false);
  const [page, setPage] = useState(1);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The .txt being read or read: its chooser names it (the file input itself is emptied on each choosing).
  const [fileName, setFileName] = useState<string | null>(null);
  const [pictures, setPictures] = useState<Picture[]>([]);
  // Counts every choosing of a file: one still being read for an earlier choice is dropped.
  const reading = useRef(0);
  // Closed (it stays drawn while it fades out) or gone, the dialog's pending replay is no longer its own.
  useEffect(() => {
    if (!open) reading.current += 1;
  }, [open]);
  useEffect(() => () => void (reading.current += 1), []);
  // The choosing the list comes from, and the one whose earlier import has been looked for.
  const [read, setRead] = useState(0);
  const [checkRetry, setCheckRetry] = useState(0);
  const [replayed, setReplayed] = useState(0);
  const replayStarted = useRef(0);
  // What an upload would import now: the new questions still ticked (a replay sends nothing else).
  const uploadable = useRef<unknown[]>([]);
  const readOperation = useRef<TdOperation | null>(null);
  const checking = useRef(false);

  const type = selectedQuestionType;
  const keyCategory = type === 'cards' || type === 'box-questions';
  const labelCategory = type === 'practice-questions';

  const categoryRows = useTdAllRows(type === 'cards' ? 'card-categories' : 'box-categories', { status: STATUSES }, keyCategory);
  const practiceRows = useTdAllRows('practice-questions', { status: STATUSES }, type === 'practice-questions');
  // Every type whose questions may name an uploaded image by its key.
  const mediaRows = useTdAllRows('media', { status: STATUSES }, type === 'cards' || type === 'practice-questions');
  const takesPictures = type === 'cards' || type === 'practice-questions';

  const categoryOptions = useMemo(() => {
    if (keyCategory) return (categoryRows.data?.rows ?? []).map((row) => ({ value: row.data.key, label: 'prompt' in row.data ? row.data.prompt : row.data.title }));
    const rows = type === 'practice-questions' ? practiceRows.data?.rows : undefined;
    const labels = new Set((rows ?? []).map((row) => row.data.category).filter(Boolean));
    if (selectedCategory && selectedCategory !== NEW) labels.add(selectedCategory);
    return [...labels].sort((a, b) => a.localeCompare(b)).map((label) => ({ value: label, label }));
  }, [keyCategory, type, categoryRows.data, practiceRows.data, selectedCategory]);
  const mediaByKey = useMemo(() => {
    const found = new Map<string, { uploadId: string | null; url: string | null }>();
    for (const row of mediaRows.data?.rows ?? []) {
      const image = releasedImage(row);
      found.set(row.data.key, { uploadId: image.uploadId || null, url: image.url });
    }
    return found;
  }, [mediaRows.data]);

  // Round III questions that name their category: the one of that name on file, or one the upload makes (the first items of its import).
  const boxNames = useMemo(
    () => (type === 'box-questions' ? [...new Map(questions.flatMap((question) => (question.kind === 'box-questions' && question.category ? [[categoryName(question.category), question.category] as const] : []))).entries()] : []),
    [type, questions],
  );
  const { categoryKeys, newCategories, titlesOnFile } = useMemo(() => {
    const keys = new Map<string, string>();
    const titles = new Map<string, string>();
    const made: Array<{ key: string; title: string }> = [];
    const rows = type === 'box-questions' ? ((categoryRows.data?.rows ?? []) as TdContentRow<'box-categories'>[]) : [];
    for (const [name, title] of boxNames) {
      const found = rows.find((row) => categoryName(row.data.title) === name);
      const key = found?.data.key ?? newBoxCategoryKey(title);
      keys.set(name, key);
      if (found) titles.set(name, found.data.title);
      else made.push({ key, title });
    }
    return { categoryKeys: keys, newCategories: made, titlesOnFile: titles };
  }, [type, boxNames, categoryRows.data]);
  /** The categories to make for these items, sent first: the import makes them, or none of it. */
  const withCategories = useCallback(
    (items: unknown[]) => {
      const used = new Set(items.map((item) => (item as { data: { categoryKey?: string } }).data.categoryKey));
      const made = newCategories.filter((made) => used.has(made.key)).map((made) => toItem('box-categories', { key: made.key, title: made.title }));
      return { sent: [...made, ...items], offset: made.length };
    },
    [newCategories],
  );

  const category = selectedCategory === NEW ? newCategory.trim() : selectedCategory;
  const categoryProblem = selectedCategory === NEW && newCategory !== '' && (category.length === 0 || category.length > 200) ? t('At most {max} characters, with no spaces at the start or end', { max: 200 }) : null;
  // The cards already in the category: a question with one's answer updates it.
  const categoryCards = useTdAllRows('cards', { category, status: STATUSES }, type === 'cards' && category !== '');
  // Practice questions that each give their own category (a “Category:” line) need none chosen for the file.
  const ownCategories =
    (type === 'practice-questions' || type === 'box-questions') && questions.length > 0 && questions.every((question) => (question.kind === 'practice-questions' || question.kind === 'box-questions') && question.category !== null);
  const ready =
    (!keyCategory && !labelCategory ? true : keyCategory ? category !== '' || ownCategories : ownCategories || (category !== '' && category.length <= 200)) &&
    // Every category on file must be known: one not read would be made again.
    (boxNames.length === 0 || (categoryRows.isSuccess && categoryRows.data.complete)) &&
    // Every card of the category must be known: one not read would be added again instead of updated.
    (type !== 'cards' || (categoryCards.isSuccess && categoryCards.data.complete && !mediaRows.isLoading));
  const cardsUnread = type === 'cards' && category !== '' && (categoryCards.isError || (categoryCards.isSuccess && !categoryCards.data.complete));
  const pictureKeys = useMemo(() => new Map(pictures.map((picture) => [pictureName(picture.name), picture.key])), [pictures]);
  const missingPictures = useMemo(
    () => [...new Set(questions.flatMap((question) => pictureFilesOf(question).filter((name) => !pictureKeys.has(pictureName(name)))))],
    [questions, pictureKeys],
  );
  const missingFiles = useMemo(() => missingPictures.filter((name) => !isPictureLink(name)), [missingPictures]);
  const missingLinks = useMemo(() => missingPictures.filter(isPictureLink), [missingPictures]);
  const [links, setLinks] = useState<Map<string, LinkState>>(new Map());
  const failedLinks = useMemo(() => missingLinks.flatMap((link) => { const state = links.get(link); return state?.status === 'failed' ? [{ link, reason: state.reason }] : []; }), [missingLinks, links]);
  const loadingLinks = missingLinks.length - failedLinks.length;
  const existingCard = useCallback(
    (question: TdParsedQuestion): TdContentRow<'cards'> | null => {
      if (question.kind !== 'cards') return null;
      const wanted = plainName(question.display);
      const cards = (categoryCards.data?.rows ?? []) as TdContentRow<'cards'>[];
      // The card of that name; else the card that spells its name so, when only one does (two players may share a
      // spelling). Two cards of one name are told apart by nobody here: `sharedName` refuses the question.
      const named = cards.filter((row) => plainName(row.data.display) === wanted);
      if (named.length > 0) return named.length === 1 ? named[0]! : null;
      const spelled = cards.filter((row) => row.data.aliases.some((alias) => plainName(alias) === wanted));
      return spelled.length === 1 ? spelled[0]! : null;
    },
    [categoryCards.data],
  );
  /** Two cards of the category carry the question's answer as their name: it could mean either. */
  const sharedName = useCallback(
    (question: TdParsedQuestion): boolean => {
      if (question.kind !== 'cards') return false;
      const wanted = plainName(question.display);
      return ((categoryCards.data?.rows ?? []) as TdContentRow<'cards'>[]).filter((row) => plainName(row.data.display) === wanted).length > 1;
    },
    [categoryCards.data],
  );

  const context = useMemo<TdUploadContext>(
    () => ({ categoryKey: keyCategory ? category : '', category: labelCategory ? category : '', puzzle: '', clubs: [], pictures: pictureKeys, categoryKeys }),
    [keyCategory, labelCategory, category, pictureKeys, categoryKeys],
  );
  // `item` is what is imported; the check is asked of `checked` (a picture's image does not exist before the upload saves it).
  const entries = useMemo(
    () =>
      ready
        ? questions.map((question) => {
            const item = toTdImportItem(question, context);
            // A picture's image does not exist before the upload saves it: the check is asked without it.
            const pictured = pictureFilesOf(question).length > 0;
            const asked = pictured ? { ...item, data: { ...(item.data as Record<string, unknown>), imageKey: null } } : item;
            return { item, asked, signature: canonicalJson(asked), updates: existingCard(question) };
          })
        : [],
    [ready, questions, context, existingCard],
  );
  // More than an import takes is not checked: it is shortened first.
  const tooMany = entries.length > TD_IMPORT_MAX_ITEMS;
  // A question that updates a card is not imported, so it is not checked as an import either.
  const pending = useMemo(() => (tooMany ? [] : entries.filter((entry) => !entry.updates && !checked.has(entry.signature))), [tooMany, entries, checked]);

  useEffect(() => {
    // A question whose answer two cards carry is refused, so it is not among them: one that becomes so while a
    // replay waits (the category read again) stops that replay.
    uploadable.current = entries.flatMap((entry, index) => (!entry.updates && !unselected.has(questions[index]!.id) && !sharedName(questions[index]!) ? [entry.item] : []));
  }, [entries, unselected, questions, sharedName]);
  const rows = useMemo<QuestionWithSelection[]>(() => {
    // The first question of the file that updates each card.
    const updater = new Map<string, number>();
    // The first question of the file with each import key: a later one is the repeat, named by its question number.
    const firstWithKey = new Map<string, number>();
    entries.forEach((entry, index) => {
      const key = String((entry.item as { data: { key?: unknown } }).data.key ?? '');
      if (key && !firstWithKey.has(key)) firstWithKey.set(key, index);
    });
    // A repeat is found here too, not only by the import's check: that check does not run while the file has errors.
    const textOf = (index: number) => {
      const said = { ...(entries[index]!.item as { data: Record<string, unknown> }).data };
      delete said.key;
      delete said.imageKey;
      return canonicalJson(said);
    };
    // Among the questions to upload: one left out repeats nothing, and is not repeated.
    const kept = (index: number) => !unselected.has(questions[index]!.id);
    const firstWithText = new Map<string, number>();
    entries.forEach((_, index) => {
      const text = textOf(index);
      if (kept(index) && !firstWithText.has(text)) firstWithText.set(text, index);
    });
    const repeated = (index: number): RowIssue[] => {
      if (!kept(index)) return [];
      const first = firstWithText.get(textOf(index));
      if (first === undefined || first === index) return [];
      const pictures = (i: number) => pictureFilesOf(questions[i]!).join('\n');
      const n = questions[first]!.questionNumber;
      return [
        pictures(first) === pictures(index)
          ? { code: 'duplicate_in_batch', path: '', message: t('The same question as question {n} of this file: remove one of them', { n }) }
          : { code: 'duplicate_in_batch', path: 'Image', message: t('The same question as question {n} of this file, with another picture: remove one of them', { n }) },
      ];
    };
    const repeatsOf = (index: number, issues: RowIssue[]): RowIssue[] =>
      issues.flatMap((issue) => {
        if (issue.code !== 'duplicate_in_batch') return [issue];
        const first = firstWithKey.get(String((entries[index]!.item as { data: { key?: unknown } }).data.key ?? ''));
        if (first === undefined || first === index) return [];
        return [{ ...issue, path: '', message: t('The same question as question {n} of this file: remove one of them', { n: questions[first]!.questionNumber }) }];
      });
    return questions.map((question, index) => {
        const entry = entries[index];
        const updates = entry?.updates ?? null;
        const signature = entry?.signature ?? null;
        const issues = signature && !updates ? (checked.get(signature) ?? []) : [];
        const isDuplicate = issues.some((issue) => issue.code === 'duplicate');
        // A picture the file names must be among those chosen, or downloaded from its link.
        const missingPicture = pictureFilesOf(question).find((name) => !pictureKeys.has(pictureName(name)));
        const problems: RowIssue[] = [
          ...(entry && !updates && repeated(index).length ? repeated(index) : isDuplicate ? [] : repeatsOf(index, issues)),
          ...(missingPicture ? [{ code: 'missing_reference' as const, path: 'Image', message: missingPictureText(missingPicture, links.get(missingPicture)) }] : []),
        ];
        if (question.kind === 'cards' && updates) {
          // What the card would become is checked as the edit it is, before anything is saved.
          const body = { version: updates.version, data: updatedCard(question, updates, imageKeyIn(question, context)), position: updates.position, note: updates.note };
          problems.push(...contentWriteIssues('cards', 'Card', 'edit', body).map((issue) => ({ code: 'invalid' as const, path: issue.path, message: issue.message })));
          // The import's check finds a new card's missing image; an update's is found here.
          if (question.imageKey && mediaRows.isError) problems.push({ code: 'missing_reference' as const, path: 'Image', message: t('The images could not be loaded to check this key. Close the upload and open it again.') });
          else if (question.imageKey && mediaRows.isSuccess && !mediaByKey.has(question.imageKey)) problems.push({ code: 'missing_reference' as const, path: 'Image', message: t('No uploaded image has this key') });
          // Among the questions ticked: one left out updates nothing.
          const earlier = updater.get(updates.id);
          if (earlier !== undefined) problems.push({ code: 'duplicate_in_batch' as const, path: 'Answer', message: t('Question {n} updates the same card', { n: earlier }) });
          else if (!unselected.has(question.id)) updater.set(updates.id, question.questionNumber);
        } else if (sharedName(question)) {
          problems.push({ code: 'invalid' as const, path: 'Answer', message: t('Two cards in this category have this name: change the one meant on its own page') });
        } else if (question.kind === 'cards' && question.clues.length === 0 && !question.photo && !question.imageKey && !question.imageFile) {
          problems.push({ code: 'invalid' as const, path: 'Clue 1', message: t('A new card needs a clue line or a picture') });
        }
        return {
          question,
          // A question that already exists cannot be uploaded, so it is never selected.
          isSelected: !unselected.has(question.id) && !isDuplicate,
          isDuplicate,
          problems,
          checked: updates !== null || (signature !== null && checked.has(signature)),
          updates,
        };
      });
  }, [questions, entries, checked, unselected, pictureKeys, links, context, mediaByKey, mediaRows.isError, mediaRows.isSuccess, sharedName]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    // The .txt and the pictures it names may be chosen together.
    const files = [...(event.target.files ?? [])];
    const images = takesPictures ? files.filter((candidate) => PICTURE_NAME.test(candidate.name)) : [];
    const texts = files.filter((candidate) => !images.includes(candidate));
    if (images.length > 0) void addPictures(images);
    if (texts.length > 1) {
      toast.error(t('Choose one .txt file, with its pictures if it names any'));
      return;
    }
    const file = texts[0];
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
    setFileName(file.name);
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
    setState((prev) => ({ ...prev, parseErrors: result.errors, lines: content.split(/\r?\n/) }));
    setPreviewIndex(null);

    if (result.questions.length === 0) {
      setQuestions([]);
      toast.error(t('No valid questions found in file'));
      return;
    }

    // Initialize with all questions selected
    setQuestions(result.questions.filter(isUploaded).map((q, idx) => ({ ...q, id: `${q.questionNumber}-${q.lineNumber}-${idx}` })));
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

  // The object URLs of the pictures shown go when they do.
  // The object URLs of the pictures go with the dialog (one replaced by a picture of the same name goes at once).
  const shownPictures = useRef(pictures);
  useEffect(() => {
    shownPictures.current = pictures;
  }, [pictures]);
  useEffect(() => () => shownPictures.current.forEach((picture) => URL.revokeObjectURL(picture.url)), []);

  /** Adds the pictures to those chosen (a downloaded one under its link); one of a name already chosen replaces it. */
  const addPictures = async (files: File[], link: string | null = null): Promise<string | null> => {
    const chosen: Picture[] = [];
    let refused: string | null = null;
    for (const file of files) {
      const problem = uploadProblem(file);
      if (problem) {
        refused = problem;
        if (!link) toast.error(`${file.name}: ${problem}`);
        continue;
      }
      const key = `pic-${(await sha256Hex(await file.arrayBuffer())).slice(0, 24)}`;
      chosen.push({ name: link ?? file.name, file, key, url: URL.createObjectURL(file), source: link });
    }
    setPictures((current) => {
      const byName = new Map(current.map((picture) => [pictureName(picture.name), picture]));
      for (const picture of chosen) {
        const replaced = byName.get(pictureName(picture.name));
        if (replaced) URL.revokeObjectURL(replaced.url);
        byName.set(pictureName(picture.name), picture);
      }
      return [...byName.values()];
    });
    return refused;
  };

  // The links the file gives are downloaded as soon as it is read, a few at a time; a failed one waits for Try again.
  const [linkRetry, setLinkRetry] = useState(0);
  const linksAsked = useRef(new Set<string>());
  const addPicturesRef = useRef(addPictures);
  useEffect(() => {
    addPicturesRef.current = addPictures;
  });
  useEffect(() => {
    const fresh = missingLinks.filter((link) => !linksAsked.current.has(link));
    if (fresh.length === 0) return;
    for (const link of fresh) linksAsked.current.add(link);
    setLinks((prev) => new Map([...prev, ...fresh.map((link) => [link, { status: 'loading' }] as const)]));
    const queue = [...fresh];
    const next = async (): Promise<void> => {
      const link = queue.shift();
      if (!link) return;
      const result = await downloadLinkPicture(link);
      const refused = result.ok ? await addPicturesRef.current([result.file], link) : null;
      setLinks((prev) => {
        const after = new Map(prev);
        if (result.ok && !refused) after.delete(link);
        else after.set(link, { status: 'failed', reason: result.ok ? 'too_big' : result.reason });
        return after;
      });
      return next();
    };
    void Promise.all(Array.from({ length: Math.min(LINK_DOWNLOADS_AT_ONCE, queue.length) }, next));
  }, [missingLinks, linkRetry]);
  const retryLinks = () => {
    for (const { link } of failedLinks) linksAsked.current.delete(link);
    setLinkRetry((n) => n + 1);
  };

  const handleRemoveQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  /** The answers of a refused import, row by row, filed under the check of each item it was sent. */
  const absorb = useCallback(
    (items: unknown[], report: ContentImportReport, offset: number) => {
      const askedOf = new Map(entries.map((entry) => [canonicalJson(entry.item), entry.signature]));
      setChecked((prev) => {
        const next = new Map(prev);
        items.forEach((item, index) => next.set(askedOf.get(canonicalJson(item)) ?? canonicalJson(item), report.rows.find((row) => row.index === index + offset)?.issues ?? []));
        return next;
      });
    },
    [entries],
  );

  /** Imports the items as drafts, all or none, under the batch key of exactly these items. */
  const importItems = useCallback(
    async (items: unknown[], replay?: TdOperation, close = true, current: () => boolean = () => true): Promise<'done' | 'spent' | 'failed'> => {
      if (!user) return 'failed';
      const { sent, offset } = withCategories(items);
      const hash = await sha256Hex(canonicalJson(sent));
      // A replay whose file was replaced (or whose dialog closed) meanwhile sends nothing.
      if (!current()) return 'failed';
      const saved = batchKeyFor(user.id, hash);
      markSent(user.id, hash, true);
      // A replay on its own shows itself as uploading; the upload's own steps do that for all of them.
      if (close) {
        setUploadCount(items.length);
        setState((prev) => ({ ...prev, isUploading: true }));
        onBusy(true);
      }
      try {
        const out = await write((operation) => tdAdmin.imports.apply(saved.key, sent, operation), [tdKeys.content, tdKeys.releases, tdKeys.imports], replay);
        if (!out.created && out.batch.status !== 'applied') {
          // Imported before and undone since: this key is spent.
          retireBatchKey(user.id, saved.key);
          return 'spent';
        }
        toast.success(out.created ? t('{n} drafts imported', { n: out.batch.rows.length }) : t('These items were imported already; nothing was added'));
        if (close) onClose();
        return 'done';
      } catch (caught) {
        // Refused, so nothing was imported under this key.
        if (caught instanceof TdApiError && (caught.code === 'validation' || caught.code === 'conflict')) markSent(user.id, hash, false);
        // A check that passed can still lose a race: the API answers with the whole report.
        if (caught instanceof TdApiError && caught.code === 'validation' && caught.details && typeof caught.details === 'object' && 'rows' in caught.details) {
          absorb(items, caught.details as ContentImportReport, offset);
        }
        toast.error(tdErrorText(caught));
        return 'failed';
      } finally {
        if (close) {
          onBusy(false);
          setState((prev) => ({ ...prev, isUploading: false }));
        }
      }
    },
    [user, write, onBusy, onClose, absorb, withCategories],
  );

  // The items of a file read again went out once without a final answer: asked with the saved key first, since a check
  // would count that import's own rows as duplicates. The API answers with that batch, or imports what the member confirmed.
  useEffect(() => {
    if (read === 0 || replayed === read || replayStarted.current === read || !ready || entries.length === 0) return;
    // `read` is the number of the file read; one chosen after it is its own, and this replay touches nothing of it.
    const mine = read;
    const superseded = () => reading.current !== mine;
    if (superseded()) return;
    replayStarted.current = read;
    const operation = readOperation.current;
    void (async () => {
      // A question whose answer two cards now carry is refused, not sent again as a new card.
      if (questions.some(sharedName)) {
        setReplayed(mine);
        return;
      }
      const items = entries.filter((entry) => !entry.updates).map((entry) => entry.item);
      const edits = entries.some((entry) => entry.updates);
      // Questions removed or unticked since the file was read are not what went out: nothing is replayed then.
      const asRead = canonicalJson(items);
      const changed = () => canonicalJson(uploadable.current) !== asRead;
      const saved = user && operation && items.length > 0 ? batchKeyFor(user.id, await sha256Hex(canonicalJson(withCategories(items).sent))) : null;
      if (superseded()) return;
      if (saved?.sent && operation && !changed()) {
        // The questions cannot be changed while it is out: what a retry sends is what is shown.
        setUploadCount(items.length);
        setState((prev) => ({ ...prev, isUploading: true }));
        onBusy(true);
        let outcome: Awaited<ReturnType<typeof importItems>>;
        try {
          outcome = await importItems(items, operation, false, () => !superseded() && !changed());
        } finally {
          onBusy(false);
          setState((prev) => ({ ...prev, isUploading: false }));
        }
        if (superseded()) return;
        if (outcome === 'done' && !edits) {
          onClose();
          return;
        }
        // The new questions are in; the cards the file updates are still to do.
        if (outcome === 'done') {
          const imported = new Set(questions.filter((_, index) => !entries[index]?.updates).map((question) => question.id));
          setQuestions((prev) => prev.filter((question) => !imported.has(question.id)));
        }
      }
      setReplayed(mine);
    })();
  }, [read, replayed, ready, entries, questions, user, importItems, onClose, onBusy, sharedName, withCategories]);

  // The check: which of the questions the API would refuse, asked once for each item. A picture still downloading
  // changes its question's key when it arrives, so the check waits for the downloads.
  useEffect(() => {
    if (!ready || read === 0 || replayed !== read || pending.length === 0 || loadingLinks > 0 || checking.current) return;
    checking.current = true;
    const asked = pending;
    void (async () => {
      try {
        const { sent, offset } = withCategories(asked.map((entry) => entry.asked));
        const report = await write((operation) => tdAdmin.imports.preview(sent, operation), []);
        checking.current = false;
        setChecked((prev) => {
          const next = new Map(prev);
          asked.forEach((entry, index) => next.set(entry.signature, report.rows.find((row) => row.index === index + offset)?.issues ?? []));
          return next;
        });
      } catch (caught) {
        checking.current = false;
        // Another member signed in meanwhile: the check was theirs to drop, not a failure.
        if (caught instanceof TdApiError && caught.code === SESSION_CHANGED) return;
        if (caught instanceof TdApiError && caught.status === 429) {
          setTimeout(() => setCheckRetry((n) => n + 1), CHECK_RETRY_MS);
          return;
        }
        toast.error(t('Failed to check the questions. You can still proceed with upload.'));
        // Keep all questions selected on error
        setChecked((prev) => {
          const next = new Map(prev);
          asked.forEach((entry) => next.set(entry.signature, []));
          return next;
        });
      }
    })();
  }, [ready, read, replayed, pending, loadingLinks, checkRetry, write, withCategories]);

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
      toast.error(t('Please select a category'));
      return;
    }

    const creates = selectedRows.filter((index) => !rows[index]!.updates);
    const updates = selectedRows.filter((index) => rows[index]!.updates);
    const items = creates.map((index) => entries[index]!.item);
    const tooBig = tdImportLimits(items);
    if (tooBig.length > 0) {
      toast.error(tooBig[0]!.message);
      return;
    }

    // Every step of the upload goes out under the sign-in it started with, or not at all.
    if (!user || tdTokens.read()?.staffId !== user.id) return;
    const operation = beginOperation(tdTokens);
    uploadInFlightRef.current = true;
    setUploadCount(selectedRows.length);
    setState((prev) => ({ ...prev, isUploading: true }));
    onBusy(true);
    try {
      // 1. The pictures the chosen questions name, saved as images first: the questions refer to them.
      const named = new Set(selectedRows.flatMap((index) => {
        const question = rows[index]!.question;
        return pictureFilesOf(question).map(pictureName);
      }));
      const saved = await savePictures(pictures.filter((picture) => named.has(pictureName(picture.name))), operation);
      if (!saved) return;
      // 2. The new questions, all or none, as one import.
      if (items.length > 0) {
        let outcome = await importItems(items, operation, false);
        // These very items were imported once and that import was undone: its key is spent, so they are imported anew under a fresh one.
        if (outcome === 'spent') outcome = await importItems(items, operation, false);
        if (outcome === 'spent') toast.error(t('These items were imported before and that import was undone. Read the file again to import them anew.'));
        if (outcome !== 'done') return;
      }
      // 3. The cards already in the category: their picture, points, clues and spellings, from the file.
      const updated = await updateCards(updates.map((index) => ({ question: rows[index]!.question, card: rows[index]!.updates! })), operation);
      if (updated.size > 0) toast.success(tn(updated.size, '{count} card updated', '{count} cards updated'));
      if (updated.size === updates.length) {
        onClose();
        return;
      }
      // Only the cards not updated stay, to try again on the cards as they are now.
      const done = new Set([...creates.map((index) => rows[index]!.question.id), ...updated]);
      setQuestions((prev) => prev.filter((question) => !done.has(question.id)));
      await queryClient.invalidateQueries({ queryKey: tdKeys.content });
    } finally {
      uploadInFlightRef.current = false;
      onBusy(false);
      setState((prev) => ({ ...prev, isUploading: false }));
    }
  };

  /** Uploads each picture and saves it as an image; one saved before (the same bytes) is used again. */
  const savePictures = async (chosen: Picture[], operation: TdOperation): Promise<boolean> => {
    try {
      for (const picture of chosen) {
        for (let attempt = 0; ; attempt++) {
          try {
            if (await findImage(picture.key, operation)) break;
            await write(async (op) => {
              const upload = await tdAdmin.media.upload(picture.file, picture.file.type, op);
              return tdAdmin.content('media').create({ data: { key: picture.key, url: null, uploadId: upload.id, width: upload.width, height: upload.height, author: null, license: null, source: picture.source } }, op);
            }, undefined, operation);
            break;
          } catch (caught) {
            if (caught instanceof TdApiError && caught.status === 429 && attempt < PICTURE_RETRIES && operationIsCurrent(tdTokens, operation)) {
              setPacing(true);
              await new Promise((resolve) => setTimeout(resolve, PICTURE_RETRY_MS));
              continue;
            }
            toast.error(t('The picture {name} could not be saved: {error}', { name: picture.source ? picture.file.name : picture.name, error: tdErrorText(caught) }));
            return false;
          }
        }
      }
      return true;
    } finally {
      setPacing(false);
    }
  };

  /** Each card the file names again, as updatedCard makes it. A changed sign-in stops them all. */
  const updateCards = async (pairs: Array<{ question: ParsedRow; card: TdContentRow<'cards'> }>, operation: TdOperation): Promise<Set<string>> => {
    const done = new Set<string>();
    for (const { question, card } of pairs) {
      const { id } = question;
      if (question.kind !== 'cards') continue;
      const data = updatedCard(question, card, imageKeyIn(question, context));
      try {
        await write((op) => tdAdmin.content('cards').edit(card.id, { version: card.version, data, position: card.position, note: card.note }, op), [tdKeys.content, tdKeys.releases], operation);
        done.add(id);
      } catch (caught) {
        // The last edit may have gone out before the sign-in changed; nothing more does.
        if (caught instanceof TdApiError && caught.code === SESSION_CHANGED) {
          toast.error(t('The sign-in changed, so the upload stopped. Check the cards before you upload again.'));
          break;
        }
        toast.error(t('The card {name} was not updated: {error}', { name: card.data.display, error: tdErrorText(caught) }));
      }
    }
    return done;
  };

  const clearFile = () => {
    reading.current += 1;
    setFileName(null);
    setState({ parseErrors: [], lines: undefined, isUploading: false });
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
    clearFile();
  };

  // Computed values
  const selectedCount = rows.filter((row) => row.isSelected).length;
  const updateCount = rows.filter((row) => row.isSelected && row.updates).length;
  const duplicateCount = rows.filter((row) => row.isDuplicate).length;
  const problemRows = rows.flatMap((row, index) => (row.problems.length > 0 ? [{ row, index }] : []));
  const problemCount = problemRows.length;
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
  const showsPicture = type === 'practice-questions' || type === 'cards';
  const showsCategory = boxNames.length > 0;
  const madeKeys = new Set(newCategories.map((made) => made.key));
  /** A Round III question's own category, as the list shows it: marked when the upload makes it. */
  const ownCategoryOf = (question: TdParsedQuestion) =>
    question.kind === 'box-questions' && question.category
      ? { name: titlesOnFile.get(categoryName(question.category)) ?? question.category, made: madeKeys.has(categoryKeys.get(categoryName(question.category)) ?? '') }
      : null;
  /** The category a question goes into, for its preview: its own line's, or the one chosen above (new when typed in, or not on file). */
  const categoryOfQuestion = (question: TdParsedQuestion): { name: string; made: boolean } | null => {
    const own = ownCategoryOf(question);
    if (own) return own;
    if (question.kind === 'practice-questions' && question.category) return { name: question.category, made: !categoryOptions.some((option) => option.value === question.category) };
    if (!(keyCategory || labelCategory) || !category) return null;
    return { name: categoryOptions.find((option) => option.value === category)?.label ?? category, made: selectedCategory === NEW };
  };

  return (
    <>
      <DialogHeader className="flex-shrink-0 pb-4">
        <DialogTitle>{t('Bulk Upload Questions')}</DialogTitle>
        <DialogDescription>
          {state.isUploading
            ? pacing
              ? t('The API takes 30 pictures a minute: the rest go up in a moment.')
              : tn(uploadCount, 'Creating {count} question…', 'Creating {count} questions…')
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
          <div className={cn('space-y-2', typeOptions.length === 1 && 'hidden')}>
            <Label htmlFor="question-type">{t('Question Type')} *</Label>
            <Select value={selectedQuestionType} onValueChange={(value: UploadQuestionType) => handleTypeChange(value)}>
              <SelectTrigger id="question-type">
                <SelectValue placeholder={t('Select a question type')} />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((option) => (
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
                <Label htmlFor="category">
                  {t('Category')}
                  {ownCategories ? '' : ' *'}
                </Label>
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

            {/* File Input */}
            <div className="space-y-2">
              <Label htmlFor="file">{t('Question File')} *</Label>
              <FileChooser
                ref={fileInputRef}
                id="file"
                chosen={fileName}
                accept={takesPictures ? '.txt,image/jpeg,image/png,image/webp' : '.txt'}
                multiple={takesPictures}
                onChange={handleFileSelect}
                // Chosen again after a fix, the same file is read again.
                onClick={(event) => {
                  event.currentTarget.value = '';
                }}
              />
              <p className="text-sm text-muted-foreground">
                {takesPictures ? t('The .txt file (max {mb} MB), and the pictures it names: choose them together.', { mb: Math.round(MAX_MB) }) : t('Upload a .txt file (max {mb} MB)', { mb: Math.round(MAX_MB) })}
              </p>
            </div>
          </div>

          {cardsUnread && (
            <Alert variant="destructive">
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                {t('The cards of this category could not be read, so nothing can be uploaded into it yet.')}
                <Button type="button" variant="outline" size="sm" onClick={() => void categoryCards.refetch()}>
                  {t('Try again')}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Pictures the file names on its Image lines */}
          {takesPictures && (
            <div className="space-y-2">
              <Label htmlFor="pictures">{t('Pictures')}</Label>
              {missingFiles.length > 0 && (
                <Alert className="border-amber-300 bg-amber-50 text-amber-900">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {tn(missingFiles.length, 'The file names a picture not chosen yet: {names}. Choose it here.', 'The file names {count} pictures not chosen yet: {names}. Choose them here.', {
                      names: missingFiles.length > 4 ? `${missingFiles.slice(0, 4).join(', ')}…` : missingFiles.join(', '),
                    })}
                  </AlertDescription>
                </Alert>
              )}
              {loadingLinks > 0 && (
                <Alert>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <AlertDescription>{tn(loadingLinks, 'Downloading {count} picture from its link…', 'Downloading {count} pictures from their links…')}</AlertDescription>
                </Alert>
              )}
              {failedLinks.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="space-y-2">
                    <p>{tn(failedLinks.length, 'A picture could not be downloaded from its link: save it and choose it here, or give another link.', '{count} pictures could not be downloaded from their links: save them and choose them here, or give other links.')}</p>
                    <ul className="space-y-1 text-xs">
                      {failedLinks.slice(0, 6).map(({ link, reason }) => (
                        <li key={link} className="break-all">
                          {link}: {linkPictureReason(reason)}
                        </li>
                      ))}
                      {failedLinks.length > 6 && <li>…</li>}
                    </ul>
                    <Button type="button" variant="outline" size="sm" onClick={retryLinks}>
                      {t('Try again')}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              <FileChooser
                id="pictures"
                chosen={pictures.length ? tn(pictures.length, '{count} picture', '{count} pictures') : null}
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => void addPictures([...(event.target.files ?? [])])}
                // Chosen again, the same pictures are read again.
                onClick={(event) => {
                  event.currentTarget.value = '';
                }}
              />
              <p className="text-sm text-muted-foreground">{t('The pictures the file names on its Image lines: JPEG, PNG or WebP, at most 2 MB each. Pictures chosen again are added. An Image line with a link needs nothing here: its picture is downloaded.')}</p>
              {pictures.length > 0 && (
                <div className="rounded-lg border p-3">
                  <div className="flex flex-wrap gap-2">
                    {pictures.map((picture) => (
                      <figure key={picture.name} className="w-16">
                        {/* eslint-disable-next-line @next/next/no-img-element -- an object URL of a file chosen or downloaded here */}
                        <img src={picture.url} alt={picture.file.name} className="h-20 w-16 rounded-md border object-cover" />
                        <figcaption className="mt-1 flex items-center gap-0.5 truncate text-[10px] text-muted-foreground" title={picture.name}>
                          {picture.source && <Link2 className="h-3 w-3 shrink-0" aria-label={t('From a link')} />}
                          <span className="truncate">{picture.file.name}</span>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

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
                      {/* Not in the list below (it could not be read): its lines from the file are shown instead. */}
                      <details className="inline">
                        <summary className="cursor-pointer">
                          <span className="font-medium capitalize">{err.severity === 'error' ? WORDS.error : WORDS.warning}</span>: {t('Line {line}', { line: err.lineNumber })}
                          {err.questionNumber && ` (${t('Question {n}', { n: err.questionNumber })})`}: {err.message}
                        </summary>
                        {state.lines && (
                          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-(--td-input) p-2 font-mono text-xs text-foreground">
                            {questionLines(state.lines, err.lineNumber).join('\n')}
                          </pre>
                        )}
                      </details>
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
                    {updateCount > 0 && <p className="text-sm text-muted-foreground">{tn(updateCount, '{count} of them updates a card already in the category', '{count} of them update cards already in the category')}</p>}
                    {duplicateCount > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {tn(duplicateCount, '{count} duplicate found and unselected.', '{count} duplicates found and unselected.')}{' '}
                        {t('They were uploaded before and are in the CMS already: find them in the Questions list under {mode}.', { mode: TYPE_OPTIONS.find((option) => option.value === type)?.label ?? '' })}
                      </p>
                    )}
                    {problemCount > 0 && (
                      <>
                        <p className="text-sm text-muted-foreground">{tn(problemCount, '{count} question has a problem: remove it or fix the file', '{count} questions have problems: remove them or fix the file')}</p>
                        <ul className="space-y-1 text-sm">
                          {problemRows.slice(0, PROBLEMS_LISTED).map(({ row, index }) => (
                            <li key={row.question.id}>
                              <button type="button" className="text-left hover:underline" onClick={() => setPreviewIndex(index)}>
                                <span className="font-medium text-amber-900">
                                  {t('Question {n}', { n: row.question.questionNumber })} · {t('Line {line}', { line: row.question.lineNumber })}
                                </span>
                                {': '}
                                <span className="text-amber-800">{row.problems.map(issueMessage).join(' · ')}</span>
                              </button>
                            </li>
                          ))}
                          {problemCount > PROBLEMS_LISTED && <li className="text-muted-foreground">{t('...and {n} more', { n: problemCount - PROBLEMS_LISTED })}</li>}
                        </ul>
                      </>
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
                <div>
                  <Label className="text-base font-semibold">{t('Parsed Questions ({n})', { n: rows.length })}</Label>
                </div>
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
                      {showsPicture && <TableHead className="w-16">{t('Picture')}</TableHead>}
                      <TableHead>{type === 'cards' || type === 'whoami-subjects' ? t('Answer') : t('Question')}</TableHead>
                      {showsCategory && <TableHead className="w-44">{t('Category')}</TableHead>}
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
                        {showsPicture && (
                          <TableCell>
                            <RowPicture question={q.question} pictures={pictures} links={links} media={mediaByKey} />
                          </TableCell>
                        )}
                        <TableCell className="max-w-md truncate">{tdQuestionSummary(q.question)}</TableCell>
                        {showsCategory && (
                          <TableCell className="text-sm">
                            <CategoryCell own={ownCategoryOf(q.question)} />
                          </TableCell>
                        )}
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
                          ) : q.updates ? (
                            <Badge variant="outline" className="border-blue-600 text-blue-600">
                              {t('Updates the card')}
                            </Badge>
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
          media={mediaByKey}
          mediaLoaded={mediaRows.isSuccess}
          pictures={pictures}
          category={categoryOfQuestion(rows[previewIndex]!.question)}
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
  media: Map<string, { uploadId: string | null; url: string | null }>;
  mediaLoaded: boolean;
  pictures: Picture[];
  /** The category it goes into, and whether the upload makes it. */
  category: { name: string; made: boolean } | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

/** An image of a question in the preview: an uploaded one by its key, or one by path or web address (a path of the game is shown; the CMS does not load foreign images, so a web address is a link). */
function PreviewImage({ label, reference, media, mediaLoaded }: { label: string; reference: string | null; media?: ParsedQuestionPreviewDialogProps['media']; mediaLoaded?: boolean }) {
  const uploaded = media && reference ? media.get(reference) : undefined;
  const isUrl = reference?.startsWith('https://') || reference?.startsWith('http://') || reference?.startsWith('/');
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

/** A picture the file names, as chosen under Pictures (or a note that it is not). */
/** A file input whose button and choice read in Georgian: the browser's own says "Choose File" in the browser's language. */
function FileChooser({ id, chosen, ...props }: Omit<ComponentProps<'input'>, 'type'> & { id: string; chosen: string | null }) {
  return (
    <div className="flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input px-1 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
      <input id={id} type="file" className="sr-only" {...props} />
      <label htmlFor={id} className="inline-flex h-7 shrink-0 cursor-pointer items-center rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-secondary/80">
        {t('Choose a file')}
      </label>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{chosen ?? t('No file chosen')}</span>
    </div>
  );
}

function ChosenPicture({ name, pictures, label = t('Image') }: { name: string; pictures: Picture[]; label?: string }) {
  const picture = pictures.find((p) => p.name.toLowerCase() === name.toLowerCase());
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1 flex items-center gap-3">
        {picture ? (
          // eslint-disable-next-line @next/next/no-img-element -- an object URL of a file chosen here
          <img src={picture.url} alt={name} className="h-32 w-24 rounded-md border object-cover" />
        ) : (
          <p className="text-xs text-destructive">{t('Choose the picture {name} under Pictures', { name })}</p>
        )}
        {picture && <p className="break-all font-mono text-xs">{name}</p>}
      </div>
    </div>
  );
}

/** A question's picture in the list of what the file gives: its SoFIFA face, its chosen or downloaded picture, or its uploaded image. */
function CategoryCell({ own }: { own: { name: string; made: boolean } | null }) {
  if (!own) return <span className="text-muted-foreground">{t('The one chosen above')}</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate">{own.name}</span>
      {own.made && <Badge variant="outline" className="shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700">{t('new')}</Badge>}
    </span>
  );
}

function RowPicture({ question, pictures, links, media }: { question: TdParsedQuestion; pictures: Picture[]; links: Map<string, LinkState>; media: ParsedQuestionPreviewDialogProps['media'] }) {
  const frame = 'h-12 w-10 rounded-md border bg-slate-100 object-cover';
  if (question.kind !== 'cards' && question.kind !== 'practice-questions') return null;
  if (question.imageFile) {
    const name = question.imageFile;
    const picture = pictures.find((p) => p.name.toLowerCase() === name.toLowerCase());
    // eslint-disable-next-line @next/next/no-img-element -- an object URL of a file chosen or downloaded here
    if (picture) return <img src={picture.url} alt="" className={frame} />;
    const waiting = isPictureLink(name) && links.get(name)?.status !== 'failed';
    return <span className={cn(frame, 'grid place-items-center text-slate-400')}>{waiting ? <Loader2 className="size-4 animate-spin" /> : <AlertCircle className="size-4 text-destructive" />}</span>;
  }
  if (question.imageKey) {
    const uploaded = media.get(question.imageKey);
    return <TdMediaThumb uploadId={uploaded?.uploadId} url={uploaded?.url} alt="" className="h-12 w-10" />;
  }
  if (question.kind === 'cards' && question.photo) {
    // eslint-disable-next-line @next/next/no-img-element -- served by the CMS's own face route
    return <img src={cardFaceSrc(question.photo)} alt="" loading="lazy" className={frame} />;
  }
  return <span className="text-sm text-muted-foreground">—</span>;
}

function ParsedQuestionPreviewDialog({ row, currentIndex, totalQuestions, media, mediaLoaded, pictures, category, onClose, onNavigate }: ParsedQuestionPreviewDialogProps) {
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
      <TdDialogContent className="flex max-h-[92vh] w-[min(92vw,760px)] max-w-none flex-col overflow-hidden p-0" aria-describedby={undefined} onClick={(e) => e.stopPropagation()}>
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

          {category && (
            <div>
              <Label className="text-xs text-muted-foreground">{t('Category')}</Label>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium">
                {category.name}
                {category.made && (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    {t('new category: the upload makes it')}
                  </Badge>
                )}
              </p>
            </div>
          )}

          {/* The question, or for a card or a Round II subject its answer */}
          {question.kind === 'cards' || question.kind === 'whoami-subjects' ? (
            <div>
              <Label className="text-xs text-muted-foreground">{t('Answer (question {n})', { n: question.questionNumber })}</Label>
              <p className="mt-1 text-lg font-semibold">{question.display}</p>
            </div>
          ) : (
            <div>
              <Label className="text-xs text-muted-foreground">{t('Question #{n}', { n: question.questionNumber })}</Label>
              <p className="text-sm font-medium mt-1">{tdQuestionSummary(question)}</p>
            </div>
          )}

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
              {question.kind === 'cards' && question.imageFile && <ChosenPicture name={question.imageFile} pictures={pictures} />}
              {question.kind === 'cards' && question.photo && (
                <div>
                  <Label className="text-xs text-muted-foreground">{t('SoFIFA face')}</Label>
                  <div className="mt-1 flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- served by the CMS's own face route */}
                    <img src={cardFaceSrc(question.photo)} alt={question.display} className="h-32 w-24 rounded-md border bg-slate-100 object-cover" />
                    <p className="text-sm">{t('{id} · version {ver}', { id: question.photo.id, ver: question.photo.ver })}</p>
                  </div>
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
              {question.imageFile && <ChosenPicture name={question.imageFile} pictures={pictures} />}

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
      </TdDialogContent>
    </Dialog>
  );
}
