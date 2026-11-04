import type { Metadata } from 'next';
import { TdNotFound } from '@/components/td/td-status-screens';
import { t } from '@/lib/td/i18n';

export const metadata: Metadata = { title: t('Page not found') };

export default function NotFound() {
  return <TdNotFound />;
}
