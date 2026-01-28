'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DuplicateInfo {
  id: string;
  category_id: string;
  category_name: Record<string, string>;
  created_at: string;
}

interface DuplicateConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duplicates: DuplicateInfo[];
  isCreating: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function DuplicateConfirmationDialog({
  open,
  onOpenChange,
  duplicates,
  isCreating,
  onConfirm,
  onCancel,
}: DuplicateConfirmationDialogProps) {
  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Possible Duplicate Found</DialogTitle>
          <DialogDescription>
            We found existing questions with the same prompt in this language.
            Do you want to create anyway?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
          {duplicates.map((item) => (
            <div key={item.id} className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">
                {item.category_name?.en || 'Unknown Category'}
              </span>
              <span className="text-slate-400">
                {new Date(item.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isCreating}>
            {isCreating ? 'Creating...' : 'Create Anyway'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
