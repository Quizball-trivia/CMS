import type { Metadata } from 'next';
import { TdSetPasswordForm } from '@/components/td/td-set-password-form';

export const metadata: Metadata = { title: 'Set a new password' };

export default function TdResetPage() {
  return <TdSetPasswordForm kind="reset" />;
}
