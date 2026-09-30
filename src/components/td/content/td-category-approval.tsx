'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TdErrorPanel } from '@/components/td/td-error-panel';
import { tdKeys, useTdAllRows, useTdWrite } from '@/hooks/use-td-content';
import type { TdContentRow } from '@/lib/td/admin-api';
import { TdApiError } from '@/lib/td/api-client';
import { tdAdmin } from '@/lib/td/client';
import { useTdAuth } from '@/providers/td-auth-provider';
import { TdStatusChip } from './td-status';

/** The contract's cap on children approved with their category in one step. */
const MAX_CHILDREN = 500;

type CategoryType = 'card-categories' | 'box-categories';
type Child = TdContentRow<'cards'> | TdContentRow<'box-questions'>;

export interface TdCategoryReview {
  /** Ready rows approved with the category (each at its revision). */
  withIt: Child[];
  approved: Child[];
  blockers: Array<{ row: Child; reason: string }>;
  /** Nothing to hold the category up, and something approved or listed. */
  canApprove: boolean;
  problem: string | null;
}

/**
 * What approving a category needs (migration 0013 content_approve): every
 * live card or question approved already or approved with it, at least one,
 * none of those last edited by the approver, at most 500 listed.
 */
export function reviewCategory(children: Child[], meId: string): TdCategoryReview {
  const withIt: Child[] = [];
  const approved: Child[] = [];
  const blockers: TdCategoryReview['blockers'] = [];
  for (const row of children) {
    if (row.status === 'approved') approved.push(row);
    else if (row.status === 'draft') blockers.push({ row, reason: 'Still a draft: mark it ready (or archive it) first.' });
    else if (row.status === 'ready' && row.lastEditor.id === meId) blockers.push({ row, reason: 'You made its last edit: another publisher approves it.' });
    else if (row.status === 'ready') withIt.push(row);
  }
  let problem: string | null = null;
  if (withIt.length > MAX_CHILDREN) problem = `At most ${MAX_CHILDREN} can be approved with the category in one step; approve some of them on their own first.`;
  else if (withIt.length + approved.length === 0) problem = 'A category needs at least one approved row.';
  return { withIt, approved, blockers, canApprove: blockers.length === 0 && problem === null, problem };
}

export function TdCategoryApproval({
  type,
  category,
  onClose,
  onApproved,
}: {
  type: CategoryType;
  category: TdContentRow<'card-categories'> | TdContentRow<'box-categories'>;
  onClose: () => void;
  onApproved: (row: TdContentRow) => void;
}) {
  const childType = type === 'card-categories' ? 'cards' : 'box-questions';
  const { user } = useTdAuth();
  const write = useTdWrite();
  const queryClient = useQueryClient();
  const children = useTdAllRows(childType, { category: category.data.key, status: 'draft,ready,approved' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const review = user && children.data ? reviewCategory(children.data.rows as Child[], user.id) : null;
  const noun = childType === 'cards' ? 'card' : 'question';

  const approve = async () => {
    if (!review) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const listed = review.withIt.map((row) => ({ id: row.id, version: row.version }));
      const row = await write((operation) => tdAdmin.content(type).approve(category.id, category.version, listed, operation));
      onApproved(row);
    } catch (caught) {
      if (caught instanceof TdApiError && caught.code === 'revision_conflict') {
        const child = (caught.details as { child?: { id: string } } | undefined)?.child;
        await queryClient.invalidateQueries({ queryKey: tdKeys.content });
        setNotice(child ? `A ${noun} changed meanwhile. The list is refreshed: check it and approve again.` : 'The category changed meanwhile. Close this and look at it again.');
      } else {
        setError(caught);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto bg-(--td-surface-2) sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Approve the category with its {noun}s</DialogTitle>
          <DialogDescription>
            Every live {noun} of “{category.data.key}” is approved already or approved now, in one step. A release then carries them together.
          </DialogDescription>
        </DialogHeader>
        {children.isLoading && <p className="text-sm text-(--td-text-3)">Loading its {noun}s…</p>}
        <TdErrorPanel error={children.error ?? error} />
        {children.data && !children.data.complete && <p className="text-sm text-(--td-danger)">This category has more rows than the CMS loads at once; approve some on their own first.</p>}
        {review && (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-(--td-text-2)">
              {review.withIt.length} ready to approve with it · {review.approved.length} approved already
              {review.blockers.length > 0 && ` · ${review.blockers.length} holding it up`}
            </p>
            {review.blockers.length > 0 && (
              <ul className="flex flex-col gap-1.5 rounded-lg border border-(--td-danger)/40 p-3">
                {review.blockers.map(({ row, reason }) => (
                  <li key={row.id} className="flex items-start gap-2">
                    <TdStatusChip status={row.status} />
                    <span className="min-w-0">
                      <span className="font-medium">{row.data.display}</span> <span className="font-mono text-xs text-(--td-text-3)">{row.data.key}</span>
                      <span className="block text-xs text-(--td-text-3)">{reason}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {review.withIt.length > 0 && (
              <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-border p-3">
                {review.withIt.map((row) => (
                  <li key={row.id} className="flex items-center gap-2">
                    <Check className="size-3.5 text-(--td-new)" />
                    <span className="truncate">{row.data.display}</span>
                    <span className="font-mono text-xs text-(--td-text-3)">{row.data.key}</span>
                  </li>
                ))}
              </ul>
            )}
            {review.problem && <p className="text-(--td-danger)">{review.problem}</p>}
          </div>
        )}
        {notice && <p className="rounded-lg bg-(--td-input) px-3 py-2 text-xs text-(--td-text-2)">{notice}</p>}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="rounded-lg">
            Cancel
          </Button>
          <Button onClick={() => void approve()} disabled={busy || !review?.canApprove || !children.data?.complete} className="rounded-lg">
            {busy ? <Loader2 className="animate-spin" /> : <Check />}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
