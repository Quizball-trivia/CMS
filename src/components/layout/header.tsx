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

export function Header() {
  const { user, logout } = useAuth();

  const initials = user?.nickname
    ? user.nickname
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : user?.email?.[0].toUpperCase() || '?';

  return (
    <header className="h-16 bg-background/40 backdrop-blur-xl flex items-center justify-end px-6 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative flex items-center gap-2 px-2 hover:bg-white/5 rounded-full transition-all duration-300 border border-transparent hover:border-white/5">
              <Avatar className="h-8 w-8 border border-white/10 shadow-inner">
                <AvatarImage src={user?.avatar_url || undefined} alt={user?.nickname || 'User'} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold backdrop-blur-md">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start text-left hidden sm:flex">
                <span className="text-xs font-bold leading-none tracking-tight">{user?.nickname || 'Admin'}</span>
                <span className="text-[10px] text-muted-foreground/60 leading-none mt-1 font-medium">{user?.role || 'Administrator'}</span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 p-2 bg-card/90 backdrop-blur-xl border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1.5 p-2 bg-white/5 rounded-lg border border-white/5">
                <p className="text-sm font-bold leading-none">{user?.nickname || 'Admin'}</p>
                <p className="text-[11px] leading-none text-muted-foreground/70 mt-1 font-mono">
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/5" />
            <DropdownMenuSeparator className="bg-white/5" />
            <DropdownMenuItem 
              onClick={() => logout()} 
              className="cursor-pointer gap-2 py-2.5 rounded-lg text-destructive focus:text-destructive focus:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="text-sm font-medium">Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
