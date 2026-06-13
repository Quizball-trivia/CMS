'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Megaphone } from 'lucide-react';
import {
  useAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
} from '@/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiClientError } from '@/services';
import type { Announcement, AnnouncementType } from '@/types';

const TYPES: { value: AnnouncementType; label: string }[] = [
  { value: 'update', label: '📢 Update' },
  { value: 'info', label: 'ℹ️ Info' },
  { value: 'event', label: '🏆 Event' },
];

interface FormState {
  titleEn: string;
  titleKa: string;
  bodyEn: string;
  bodyKa: string;
  type: AnnouncementType;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  titleEn: '',
  titleKa: '',
  bodyEn: '',
  bodyKa: '',
  type: 'update',
  isActive: true,
};

function toForm(a: Announcement): FormState {
  return {
    titleEn: a.title.en ?? '',
    titleKa: a.title.ka ?? '',
    bodyEn: a.body.en ?? '',
    bodyKa: a.body.ka ?? '',
    type: a.type,
    isActive: a.isActive,
  };
}

export default function AnnouncementsPage() {
  const { data: announcements = [], isLoading, error } = useAnnouncements();
  const createMutation = useCreateAnnouncement();
  const updateMutation = useUpdateAnnouncement();
  const deleteMutation = useDeleteAnnouncement();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (a: Announcement) => {
    setEditing(a);
    setForm(toForm(a));
    setDialogOpen(true);
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  const handleSave = async () => {
    if (!form.titleEn.trim() || !form.titleKa.trim() || !form.bodyEn.trim() || !form.bodyKa.trim()) {
      toast.error('All English and Georgian fields are required');
      return;
    }
    const payload = {
      title: { en: form.titleEn.trim(), ka: form.titleKa.trim() },
      body: { en: form.bodyEn.trim(), ka: form.bodyKa.trim() },
      type: form.type,
      isActive: form.isActive,
    };
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, data: payload });
        toast.success('Announcement updated');
      } else {
        await createMutation.mutateAsync(payload);
        toast.success('Announcement created');
      }
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to save announcement');
    }
  };

  const handleDelete = async (a: Announcement) => {
    if (!window.confirm(`Delete this announcement?\n\n"${a.title.en ?? ''}"`)) return;
    try {
      await deleteMutation.mutateAsync(a.id);
      toast.success('Announcement deleted');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to delete announcement');
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="size-6 text-gray-700" />
          <h1 className="text-2xl font-semibold text-gray-900">Announcements</h1>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1.5 size-4" />
          New announcement
        </Button>
      </div>
      <p className="-mt-4 text-sm text-gray-500">
        Shown in the player app&apos;s News list. Active announcements appear to all players, newest
        first. No deploy needed — changes are live immediately.
      </p>

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-500">Failed to load announcements.</p>
      ) : announcements.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          No announcements yet. Create one to show it in the player News list.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title (EN)</TableHead>
              <TableHead className="w-24">Type</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-32">Created</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {announcements.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium text-gray-900">{a.title.en}</TableCell>
                <TableCell>
                  <span className="text-sm capitalize text-gray-600">{a.type}</span>
                </TableCell>
                <TableCell>
                  {a.isActive ? (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Hidden</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-gray-500">
                  {new Date(a.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(a)} aria-label="Edit">
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(a)}
                      aria-label="Delete"
                      className="text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit announcement' : 'New announcement'}</DialogTitle>
            <DialogDescription>
              Enter both English and Georgian text — players see their own language.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="titleEn">Title (EN)</Label>
                <Input
                  id="titleEn"
                  value={form.titleEn}
                  onChange={(e) => setForm((f) => ({ ...f, titleEn: e.target.value }))}
                  placeholder="Ranked system update"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="titleKa">Title (KA)</Label>
                <Input
                  id="titleKa"
                  value={form.titleKa}
                  onChange={(e) => setForm((f) => ({ ...f, titleKa: e.target.value }))}
                  placeholder="Ranked სისტემის განახლება"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bodyEn">Body (EN)</Label>
                <Textarea
                  id="bodyEn"
                  rows={4}
                  value={form.bodyEn}
                  onChange={(e) => setForm((f) => ({ ...f, bodyEn: e.target.value }))}
                  placeholder="What changed…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bodyKa">Body (KA)</Label>
                <Textarea
                  id="bodyKa"
                  rows={4}
                  value={form.bodyKa}
                  onChange={(e) => setForm((f) => ({ ...f, bodyKa: e.target.value }))}
                  placeholder="რა შეიცვალა…"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v as AnnouncementType }))}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="mt-6 flex cursor-pointer select-none items-center gap-2 text-sm text-gray-700">
                <Checkbox
                  checked={form.isActive}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, isActive: c === true }))}
                />
                Active (visible to players)
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
