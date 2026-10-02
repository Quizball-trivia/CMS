'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArchiveRestore, Loader2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TdCellTitle, TdContentList } from '@/components/td/content/td-content-list';
import { TdContentEditorDialog, type TdEditorTarget } from '@/components/td/content/td-content-editor';
import { useTdWrite } from '@/hooks/use-td-content';
import type { TdContentRow } from '@/lib/td/admin-api';
import { tdAdmin } from '@/lib/td/client';
import { tdErrorText } from '@/lib/td/errors';
import { t } from '@/lib/td/i18n';
import { isTdPublisher } from '@/lib/td/workflow';
import { useTdAuth } from '@/providers/td-auth-provider';

type CategoryType = 'card-categories' | 'box-categories';
type CategoryRow = TdContentRow<CategoryType>;

const nameOf = (row: CategoryRow) => ('prompt' in row.data ? row.data.prompt : row.data.title) || row.data.key;

/** The categories of the two rounds that have them: add one, change it, delete
 *  it or bring it back. Their cards and questions are on the Questions page. */
export function TdCategoriesTab() {
  const { user } = useTdAuth();
  const write = useTdWrite();
  const publisher = user ? isTdPublisher(user.role) : false;
  // An editor deletes only a draft of their own that was never approved (the API also checks nobody else touched it); a publisher restores.
  const canDelete = (row: CategoryRow) => publisher || (row.approvedVersion === null && row.lastEditor.id === user?.id);
  const [target, setTarget] = useState<TdEditorTarget | null>(null);
  const [deleting, setDeleting] = useState<{ type: CategoryType; row: CategoryRow } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  const act = async (action: 'archive' | 'restore', type: CategoryType, row: CategoryRow) => {
    setBusy(row.id);
    setRefused(null);
    try {
      await write((operation) => tdAdmin.content(type)[action](row.id, row.version, operation));
      toast.success(action === 'archive' ? t('Category deleted') : t('Category restored'));
      setDeleting(null);
    } catch (error) {
      if (action === 'archive') setRefused(tdErrorText(error));
      else toast.error(tdErrorText(error));
    } finally {
      setBusy(null);
    }
  };

  const actions = (type: CategoryType, row: CategoryRow, href: string, label: string) => (
    <span className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
      <Link href={href} className="mr-1 whitespace-nowrap text-xs font-bold text-blue-700 underline underline-offset-2">
        {label}
      </Link>
      <Button variant="ghost" size="icon-sm" aria-label={t('Edit the category')} title={t('Edit the category')} onClick={() => setTarget({ type, row })} className="text-slate-400 hover:text-slate-900">
        <Pencil />
      </Button>
      {row.status === 'archived' ? (
        publisher && (
          <Button variant="ghost" size="icon-sm" aria-label={t('Restore the category')} title={t('Restore the category')} disabled={busy !== null} onClick={() => void act('restore', type, row)}>
            {busy === row.id ? <Loader2 className="animate-spin" /> : <ArchiveRestore />}
          </Button>
        )
      ) : canDelete(row) ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('Delete the category')}
          title={t('Delete the category')}
          disabled={busy !== null}
          onClick={() => {
            setRefused(null);
            setDeleting({ type, row });
          }}
          className="text-slate-400 hover:text-red-600"
        >
          <Trash2 />
        </Button>
      ) : null}
    </span>
  );

  return (
    <>
      <div className="flex flex-col gap-6">
        <TdContentList
          type="card-categories"
          title={t('Round I · ბარათონი')}
          description={t('Each category holds cards worth 1 to 3 points. A category is approved with its cards.')}
          bulk={false}
          onOpen={(row) => setTarget({ type: 'card-categories', row })}
          onCreate={() => setTarget({ type: 'card-categories', row: null })}
          createLabel={t('New category')}
          emptyTitle={t('No card categories yet')}
          columns={[
            { header: t('Category'), cell: (row) => <TdCellTitle title={row.data.prompt} sub={row.data.key} /> },
            { header: '', className: 'w-48 text-right', cell: (row) => actions('card-categories', row, `/td/questions?mode=round-1&category=${encodeURIComponent(row.data.key)}`, t('Its cards')) },
          ]}
        />
        <TdContentList
          type="box-categories"
          title={t('Round III · პაპა კარლოს ყუთი')}
          description={t("Each category holds the box's questions. A category is approved with its questions.")}
          bulk={false}
          onOpen={(row) => setTarget({ type: 'box-categories', row })}
          onCreate={() => setTarget({ type: 'box-categories', row: null })}
          createLabel={t('New category')}
          emptyTitle={t('No box categories yet')}
          columns={[
            { header: t('Category'), cell: (row) => <TdCellTitle title={row.data.title} sub={row.data.key} /> },
            { header: '', className: 'w-52 text-right', cell: (row) => actions('box-categories', row, `/td/questions?mode=round-3&category=${encodeURIComponent(row.data.key)}`, t('Its questions')) },
          ]}
        />
      </div>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && busy === null && setDeleting(null)}>
        <DialogContent className="rounded-[2rem] sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t('Delete this category?')}</DialogTitle>
            <DialogDescription>
              {deleting && t('“{name}” leaves the game at the next publish. Nothing is lost: show the archived ones with the status filter and restore it whenever you want.', { name: nameOf(deleting.row) })}
            </DialogDescription>
          </DialogHeader>
          {refused && (
            <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              {refused}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy !== null} onClick={() => setDeleting(null)}>
              {t('Cancel')}
            </Button>
            <Button variant="destructive" disabled={busy !== null} onClick={() => deleting && void act('archive', deleting.type, deleting.row)}>
              {busy !== null ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {t('Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TdContentEditorDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}
