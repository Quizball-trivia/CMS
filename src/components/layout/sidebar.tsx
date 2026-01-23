import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  Layers, 
  HelpCircle, 
  Settings, 
  ChevronRight,
  Database
} from 'lucide-react';

const navItems = [
  {
    title: 'Categories',
    href: '/categories',
    icon: Layers,
  },
  {
    title: 'Questions',
    href: '/questions',
    icon: HelpCircle,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-card/40 backdrop-blur-xl border-r border-white/10 flex flex-col h-screen sticky top-0 shadow-2xl">
      <div className="p-6 border-b border-white/10 flex items-center gap-3">
        <div className="bg-primary/90 rounded-lg p-1.5 shadow-lg shadow-primary/20 backdrop-blur-md border border-white/10">
          <Database className="w-5 h-5 text-primary-foreground" />
        </div>
        <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/60">QuizBall</h1>
      </div>

      <div className="flex-1 py-6 flex flex-col justify-between overflow-y-auto">
        <nav className="px-4 space-y-8">
          <div>
            <p className="px-3 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.2em] mb-4">
              Content Management
            </p>
            <ul className="space-y-1.5">
              {navItems.map((item) => {
                const isActive = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'group flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 border border-transparent',
                        isActive
                          ? 'bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 border-white/10 backdrop-blur-md'
                          : 'text-muted-foreground hover:bg-white/5 hover:text-foreground hover:border-white/5'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={cn(
                          "w-5 h-5 transition-all duration-300 group-hover:scale-110",
                          isActive ? "text-primary-foreground" : "text-muted-foreground/70"
                        )} />
                        {item.title}
                      </div>
                      {isActive && (
                        <ChevronRight className="w-4 h-4 text-primary-foreground/70 animate-in fade-in slide-in-from-left-2 duration-300" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
          
          <div>
            
          </div>
        </nav>

        <div className="px-6 py-4 mt-auto">
          <div className="bg-white/5 rounded-2xl p-4 border border-white/5 backdrop-blur-md">
            <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1">CMS Version</p>
            <p className="text-xs font-mono text-foreground/80">v0.1.0-alpha.1</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
