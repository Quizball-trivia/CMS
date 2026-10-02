'use client';

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { t } from '@/lib/td/i18n';
import type { TdTab } from '@/lib/td/navigation';
import { TD_ROOT } from '@/lib/workspace-guard';
import { useTdAuth } from '@/providers/td-auth-provider';
import { TD_ROLE_LABELS, type TdStaff } from '@/types/td';
import betssonSport from './betsson-sport.png';
import { TdEnvironmentBanner } from './td-environment-badge';
import { TdNav } from './td-nav';

function initials(user: TdStaff): string {
  const source = user.name.trim() || user.email;
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** The Quizball CMS's frame (app/(dashboard)/layout.tsx with its sidebar and
 *  header), so the two workspaces are worked the same way: the environment
 *  strip, the white sidebar with the logo and grouped pages, the account menu
 *  top right, the wide content column. */
export function TdShell({ user, activeTab, children }: { user: TdStaff; activeTab: TdTab | null; children: ReactNode }) {
  const { logout } = useTdAuth();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    await logout();
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc] selection:bg-primary/30 selection:text-primary">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[-10%] top-[-10%] h-[40%] w-[40%] animate-pulse rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute right-[-5%] top-[20%] h-[30%] w-[30%] animate-pulse rounded-full bg-blue-400/10 blur-[100px] delay-700" />
        <div className="absolute bottom-[-5%] left-[20%] h-[35%] w-[35%] animate-pulse rounded-full bg-purple-400/10 blur-[110px] delay-1000" />
      </div>

      <TdEnvironmentBanner />

      <div className="flex min-h-0 flex-1">
        <aside className="sticky top-0 z-30 flex h-screen w-20 shrink-0 flex-col border-r border-slate-200/80 bg-white lg:w-60">
          <Link
            href={TD_ROOT}
            aria-label={t('Table Derby CMS home')}
            className="flex h-24 flex-col items-center justify-center gap-1.5 border-b border-slate-100 px-3 lg:items-start lg:px-6"
          >
            <Image src={betssonSport} alt="Betsson Sport" width={411} height={144} priority className="h-5 w-auto lg:h-10" />
            <span className="hidden text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 lg:block">{t('Table Derby CMS')}</span>
          </Link>
          <TdNav role={user.role} activeKey={activeTab?.key ?? null} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-16 items-center justify-end bg-background/40 px-6 backdrop-blur-xl">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" aria-label={t('Account')} className="relative flex items-center gap-2 rounded-full px-2">
                  <Avatar className="h-8 w-8 border border-slate-200">
                    <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">{initials(user)}</AvatarFallback>
                  </Avatar>
                  <span className="hidden flex-col items-start text-left sm:flex">
                    <span className="text-xs font-bold leading-none tracking-tight">{user.name || user.email}</span>
                    <span className="mt-1 text-[10px] font-medium leading-none text-muted-foreground">{TD_ROLE_LABELS[user.role]}</span>
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-2">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1.5 rounded-lg border border-slate-100 bg-slate-50 p-2">
                    <p className="text-sm font-bold leading-none">{user.name || t('Staff')}</p>
                    <p className="mt-1 font-mono text-[11px] leading-none text-muted-foreground">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={signingOut}
                  onClick={signOut}
                  className="cursor-pointer gap-2 rounded-lg py-2.5 text-destructive transition-colors focus:bg-destructive/10 focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="text-sm font-medium">{t('Log out')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          <main className="flex-1 overflow-y-auto p-6 duration-500 animate-in fade-in">
            <div className="mx-auto flex max-w-[1800px] flex-col gap-6">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
