import type { Metadata } from 'next';
import { TdSetPasswordForm } from '@/components/td/td-set-password-form';
import { t } from '@/lib/td/i18n';

export const metadata: Metadata = { title: t('Join the team') };

export default function TdAcceptInvitePage() {
  return <TdSetPasswordForm kind="invite" />;
}
