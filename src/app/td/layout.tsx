import type { Metadata } from 'next';
import { Noto_Sans_Georgian } from 'next/font/google';
import { notFound } from 'next/navigation';
import { t, TD_LANG } from '@/lib/td/i18n';
import { WORKSPACE } from '@/lib/workspace';
import { TdProviders } from '@/providers/td-providers';
import './td-theme.css';

// Betsson's November GeLC is licensed separately; Noto Sans Georgian stands in, as in the game.
const tdFont = Noto_Sans_Georgian({
  variable: '--font-td',
  subsets: ['georgian', 'latin'],
});

export const metadata: Metadata =
  WORKSPACE === 'table-derby'
    ? {
        title: { default: t('Table Derby CMS'), template: t('%s · Table Derby CMS') },
        description: t('Content management for Table Derby'),
        robots: { index: false, follow: false },
      }
    : {};

export default function TableDerbyLayout({ children }: { children: React.ReactNode }) {
  // Second guard behind src/proxy.ts: Table Derby never renders inside the Quizball CMS.
  if (WORKSPACE !== 'table-derby') notFound();

  return (
    <div lang={TD_LANG} className={`td-theme ${tdFont.variable} min-h-screen bg-background text-foreground antialiased`}>
      <TdProviders>{children}</TdProviders>
    </div>
  );
}
