import type { Metadata } from 'next';
import { TdSetPasswordForm } from '@/components/td/td-set-password-form';
import { t } from '@/lib/td/i18n';

export const metadata: Metadata = { title: t('Set a new password') };

export default function TdResetPage() {
  return <TdSetPasswordForm kind="reset" />;
}
