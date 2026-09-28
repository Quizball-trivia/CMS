'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { LogOut, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { tabForPath } from '@/lib/td/navigation';
import { useTdAuth } from '@/providers/td-auth-provider';
import { TD_ROLE_LABELS, type TdStaff } from '@/types/td';
import { TdEnvironmentBadge } from './td-environment-badge';
import { TdNav } from './td-nav';
import { TdWordmark } from './td-wordmark';

function initials(user: TdStaff): string {
  const source = user.name.trim() || user.email;
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function TdShell({ user, children }: { user: TdStaff; children: ReactNode }) {
  const { logout } = useTdAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const tab = tabForPath(pathname);

  const signOut = async () => {
    setSigningOut(true);
    await logout();
  };

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-border bg-(--td-header) lg:flex">
        <div className="px-5 pb-6 pt-5">
          <TdWordmark />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-6">
          <TdNav role={user.role} />
        </div>
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 border-border bg-(--td-header) p-0">
          <SheetHeader className="px-5 pt-5">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">Table Derby CMS sections</SheetDescription>
            <TdWordmark />
          </SheetHeader>
          <div className="overflow-y-auto px-3 pb-6">
            <TdNav role={user.role} onNavigate={() => setMenuOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-border bg-(--td-header)/95 px-4 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation"
            onClick={() => setMenuOpen(true)}
          >
            <Menu />
          </Button>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-(--td-text-2)">{tab?.label ?? 'Table Derby'}</p>
          <TdEnvironmentBadge className="hidden sm:flex" />
          <div className="flex items-center gap-3 border-l border-border pl-3">
            <span
              aria-hidden
              className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-bold text-foreground"
            >
              {initials(user)}
            </span>
            <div className="hidden min-w-0 flex-col leading-tight md:flex">
              <span className="truncate text-sm font-semibold">{user.name}</span>
              <span className="truncate text-xs text-(--td-text-3)">{TD_ROLE_LABELS[user.role]}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              title="Sign out"
              disabled={signingOut}
              onClick={signOut}
              className="text-(--td-text-2) hover:text-(--td-danger)"
            >
              <LogOut />
            </Button>
          </div>
        </header>
        <TdEnvironmentBadge className="border-b border-border px-4 py-2 sm:hidden" />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
