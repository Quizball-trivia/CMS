import { useAuth } from '@/providers';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogOut } from 'lucide-react';
import { MobileNav } from './mobile-nav';
import { cmsRole } from '@/lib/freecroco/access';
import { fcLangForRole, fcText } from '@/lib/freecroco/i18n';

export function Header() {
  const { user, logout } = useAuth();
  const { t } = fcText(fcLangForRole(user?.role));
  const roleLabel = cmsRole(user?.role) === 'partner_staff' ? t('Freecroco staff member') : user?.role || 'Administrator';

  const initials = user?.nickname
    ? user.nickname
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : user?.email?.[0].toUpperCase() || '?';

  return (
    // Phones only: from md up the sidebar carries the navigation and the account.
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 bg-ink px-3 text-white md:hidden">
      <MobileNav />
      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative flex items-center gap-2 rounded-full px-2 text-white hover:bg-white/10 hover:text-white">
              <Avatar className="h-8 w-8 border border-white/10 shadow-inner">
                <AvatarImage src={user?.avatar_url || undefined} alt={user?.nickname || 'User'} />
                <AvatarFallback className="bg-brand/20 text-xs font-bold text-brand">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start text-left hidden sm:flex">
                <span className="text-xs font-bold leading-none tracking-tight">{user?.nickname || 'Admin'}</span>
                <span className="text-[11px] text-slate-400 leading-none mt-1 font-medium">{roleLabel}</span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 p-2">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1.5 p-2">
                <p className="text-sm font-bold leading-none">{user?.nickname || 'Admin'}</p>
                <p className="text-[11px] leading-none text-muted-foreground/70 mt-1 font-mono">
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => logout()} 
              className="cursor-pointer gap-2 py-2.5 rounded-lg text-destructive focus:text-destructive focus:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="text-sm font-medium">{t('Log out')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
