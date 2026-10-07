import type { Metadata } from 'next';
import { TdSetPasswordForm } from '@/components/td/td-set-password-form';

export const metadata: Metadata = { title: 'Join the team' };

export default function TdAcceptInvitePage() {
  return <TdSetPasswordForm kind="invite" />;
}
