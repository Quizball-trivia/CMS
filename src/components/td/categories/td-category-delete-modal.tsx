'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TdDialogContent } from '@/components/td/td-dialog';
import { useTdWrite } from '@/hooks/use-td-content';
import { tdAdmin } from '@/lib/td/client';
import { tdErrorText } from '@/lib/td/errors';
import { t } from '@/lib/td/i18n';
import { contentActions } from '@/lib/td/workflow';
import { useTdAuth } from '@/providers/td-auth-provider';
import { categoryName, categoryTypeOf, type TdCategoryRow } from './td-category-data';

export interface TdCategoryDeleteModalProps {
  category: TdCategoryRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Quizball's delete confirmation. Here "delete" archives: the category leaves the game at the next publish and it can be restored. */
export function TdCategoryDeleteModal({ category, open, onOpenChange }: TdCategoryDeleteModalProps) {
  const { user } = useTdAuth();
  const write = useTdWrite();
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const type = categoryTypeOf(category);
  const allowed = user ? contentActions(category).archive : null;

  const close = () => {
    setRefused(null);
    onOpenChange(false);
  };

  const handleDelete = async () => {
    setBusy(true);
    setRefused(null);
    try {
      await write((operation) => tdAdmin.content(type).archive(category.id, category.version, operation));
      toast.success(t('Category deleted'));
      close();
    } catch (error) {
      setRefused(tdErrorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && (next ? onOpenChange(true) : close())}>
      <TdDialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>{t('Delete Category: "{name}"', { name: categoryName(category) })}</DialogTitle>
          <DialogDescription>{t('Are you sure you want to delete this category? It leaves the game at the next publish. Nothing is lost: it moves to Archived at the bottom of the page, and you can restore it.')}</DialogDescription>
        </DialogHeader>

        {refused && (
          <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {refused}
          </p>
        )}
        {allowed && !allowed.allowed && (
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {allowed.reason}
          </p>
        )}

        <DialogFooter className="mt-6 gap-2 sm:gap-0">
          <Button variant="outline" onClick={close} disabled={busy}>
            {t('Cancel')}
          </Button>
          <Button variant="destructive" onClick={() => void handleDelete()} disabled={busy || !allowed?.allowed}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('Deleting...')}
              </>
            ) : (
              t('Delete')
            )}
          </Button>
        </DialogFooter>
      </TdDialogContent>
    </Dialog>
  );
}
