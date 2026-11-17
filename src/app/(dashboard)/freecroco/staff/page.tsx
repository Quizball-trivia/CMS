'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { UserCog } from 'lucide-react';
import { useAuth } from '@/providers';
import {
  useAddFreecrocoStaff,
  useFreecrocoStaff,
  useRemoveFreecrocoStaff,
  useUpdateFreecrocoStaffRole,
} from '@/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { canManageStaff } from '@/lib/freecroco/access';
import { useFcText } from '@/lib/freecroco/i18n';
import type { Translate } from '@/lib/freecroco/translate';
import { getErrorFeedback } from '@/lib/error-feedback';
import { formatGeorgiaTime } from '@/lib/td/georgia';
import type { PartnerStaffMember, StaffAddResult, StaffRole } from '@/types/freecroco';

const ROLE_LABELS: Record<StaffRole, string> = {
  viewer: 'Viewer: sees everything, changes nothing',
  editor: 'Editor: can also change games and the calendar',
};

const selectClass =
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

function addedMessage(email: string, result: StaffAddResult, t: Translate): string {
  if (result.account === 'existing') {
    return t('{email} already had a Quizball account. It is now Freecroco staff and signs in to this CMS only.', { email });
  }
  return result.inviteSent
    ? t('Invite sent to {email}.', { email })
    : t('{email} already has a sign-in; they can use it here now.', { email });
}

function StaffRow({ member }: { member: PartnerStaffMember }) {
  const { t } = useFcText();
  const update = useUpdateFreecrocoStaffRole();
  const remove = useRemoveFreecrocoStaff();
  const name = member.email ?? member.userId;
  const working = update.isPending || remove.isPending;

  const changeRole = async (role: StaffRole) => {
    try {
      await update.mutateAsync({ userId: member.userId, role });
      toast.success(role === 'editor' ? t('{name} is now an editor', { name }) : t('{name} is now a viewer', { name }));
    } catch (err) {
      const feedback = getErrorFeedback(err, t('Failed to change the role'));
      toast.error(feedback.title, { description: feedback.description });
    }
  };

  const handleRemove = async () => {
    if (!window.confirm(t('Remove {name} from Freecroco staff?\n\nThey lose access to this CMS straight away.', { name }))) return;
    try {
      await remove.mutateAsync(member.userId);
      toast.success(t('{name} was removed', { name }));
    } catch (err) {
      const feedback = getErrorFeedback(err, t('Failed to remove the staff member'));
      toast.error(feedback.title, { description: feedback.description });
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium text-gray-900">{member.email ?? <span className="font-mono text-xs">{member.userId}</span>}</TableCell>
      <TableCell>
        <select
          aria-label={t('Role of {name}', { name })}
          className={selectClass}
          value={member.role}
          disabled={working}
          onChange={(e) => void changeRole(e.target.value as StaffRole)}
        >
          <option value="viewer">{t('Viewer')}</option>
          <option value="editor">{t('Editor')}</option>
        </select>
      </TableCell>
      <TableCell className="text-sm text-gray-600">
        {formatGeorgiaTime(member.addedAt)}
        {member.addedBy?.email && <span className="block text-xs text-gray-400">{t('by {email}', { email: member.addedBy.email })}</span>}
      </TableCell>
      <TableCell className="text-sm text-gray-600">
        {member.lastSignInAt ? formatGeorgiaTime(member.lastSignInAt) : <span className="text-gray-400">{t('Never')}</span>}
      </TableCell>
      <TableCell className="text-right">
        <Button variant="outline" size="sm" disabled={working} onClick={() => void handleRemove()} aria-label={t('Remove {name}', { name })}>
          {t('Remove')}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function AddStaffForm() {
  const { t } = useFcText();
  const add = useAddFreecrocoStaff();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('viewer');
  const trimmed = email.trim();

  return (
    <form
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!trimmed) return;
        try {
          const result = await add.mutateAsync({ email: trimmed, role });
          toast.success(addedMessage(trimmed.toLowerCase(), result, t));
          setEmail('');
          setRole('viewer');
        } catch (err) {
          const feedback = getErrorFeedback(err, t('Failed to add the staff member'));
          toast.error(feedback.title, { description: feedback.description });
        }
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1 space-y-1.5">
          <Label htmlFor="fc-staff-email">{t('Email')}</Label>
          <Input
            id="fc-staff-email"
            type="email"
            autoComplete="off"
            placeholder="name@freecroco.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fc-staff-role">{t('Role')}</Label>
          <select
            id="fc-staff-role"
            className={selectClass}
            value={role}
            onChange={(e) => setRole(e.target.value as StaffRole)}
          >
            <option value="viewer">{t('Viewer')}</option>
            <option value="editor">{t('Editor')}</option>
          </select>
        </div>
        <Button type="submit" disabled={!trimmed || add.isPending}>
          {add.isPending ? t('Adding…') : t('Add staff member')}
        </Button>
      </div>
      <p className="text-xs text-gray-500">
        {t(ROLE_LABELS[role])}.{' '}
        {t('A new email gets an invite to set a password. An email that already has a Quizball player account turns that account into a staff account (no playing on quizball.io) until it is removed here.')}
      </p>
    </form>
  );
}

export default function FreecrocoStaffPage() {
  const { t } = useFcText();
  const { user } = useAuth();
  const allowed = canManageStaff(user?.role);
  const { data, isLoading, refetch } = useFreecrocoStaff(allowed);

  if (!allowed) return <p className="text-sm text-gray-500">{t('Only Quizball admins can manage Freecroco staff.')}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <UserCog className="size-6 text-gray-700" />
        <h1 className="text-2xl font-semibold text-gray-900">{t('Freecroco staff')}</h1>
      </div>
      <p className="-mt-4 text-sm text-gray-500">
        {t('People at Freecroco who can sign in to this CMS. They only ever see the Freecroco section. Times are Georgia time.')}
      </p>

      <AddStaffForm />

      {isLoading && <p className="text-sm text-gray-400">{t('Loading…')}</p>}
      {!isLoading && !data && (
        <div className="space-y-3">
          <p className="text-sm text-red-500">{t('Failed to load the staff list.')}</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            {t('Retry')}
          </Button>
        </div>
      )}
      {data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Email')}</TableHead>
              <TableHead className="w-36">{t('Role')}</TableHead>
              <TableHead>{t('Added')}</TableHead>
              <TableHead>{t('Last sign-in')}</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-gray-400">{t('No staff yet.')}</TableCell>
              </TableRow>
            ) : (
              data.items.map((member) => <StaffRow key={member.userId} member={member} />)
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
