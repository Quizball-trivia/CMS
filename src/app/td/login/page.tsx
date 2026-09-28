import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TdLoginForm } from '@/components/td/td-login-form';
import { TdFullScreenLoader } from '@/components/td/td-status-screens';

export const metadata: Metadata = { title: 'Sign in' };

export default function TdLoginPage() {
  return (
    <Suspense fallback={<TdFullScreenLoader />}>
      <TdLoginForm />
    </Suspense>
  );
}
