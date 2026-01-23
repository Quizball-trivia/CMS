'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Layers,
  HelpCircle,
  ChevronRight,
  ChevronLeft,
  PanelLeftClose,
  PanelLeft,
  Trophy
} from 'lucide-react';
import { Button } from '@/components/ui/button';

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

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "bg-card/40 backdrop-blur-xl border-r border-white/10 flex flex-col h-screen sticky top-0 shadow-2xl transition-[width] duration-300 ease-in-out z-[100]",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className={cn(
        "p-4 border-b border-white/10 flex items-center h-16 transition-all duration-300",
        collapsed ? "justify-center px-0" : "justify-between"
      )}>
        <div className={cn("flex items-center transition-all duration-300 min-w-0", collapsed ? "w-10 justify-center" : "gap-3")}>
          <div className="bg-primary/90 rounded-lg p-1.5 shadow-lg shadow-primary/20 backdrop-blur-md border border-white/10 flex-shrink-0">
            <Trophy className="w-5 h-5 text-primary-foreground" />
          </div>
          <h1 className={cn(
            "text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/60 transition-all duration-300 origin-left whitespace-nowrap overflow-hidden",
            collapsed ? "w-0 opacity-0 -translate-x-4" : "w-auto opacity-100 translate-x-0"
          )}>
            QuizBall
          </h1>
        </div>

        {!collapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-300"
          >
            <PanelLeftClose className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 py-6 flex flex-col justify-between overflow-y-auto scrollbar-hide overflow-x-hidden">
        <nav className={cn("space-y-8 transition-all duration-300", collapsed ? "px-2" : "px-4")}>
          <div>
            <p className={cn(
              "px-3 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.2em] mb-4 transition-all duration-300 whitespace-nowrap overflow-hidden",
              collapsed ? "opacity-0 h-0 mb-0 pointer-events-none" : "opacity-100 h-auto"
            )}>
              Content
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
                        'group flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 border border-transparent relative overflow-hidden',
                        isActive
                          ? 'bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 border-white/10 backdrop-blur-md'
                          : 'text-muted-foreground hover:bg-white/5 hover:text-foreground hover:border-white/5',
                        collapsed ? 'justify-center w-10 h-10 p-0 mx-auto' : 'gap-3'
                      )}
                      title={collapsed ? item.title : undefined}
                    >
                      <Icon className={cn(
                        "w-5 h-5 transition-all duration-300 flex-shrink-0",
                        isActive ? "text-primary-foreground" : "text-muted-foreground/70 group-hover:text-foreground group-hover:scale-110"
                      )} />
                      
                      <span className={cn(
                        "transition-all duration-300 whitespace-nowrap overflow-hidden origin-left",
                        collapsed ? "w-0 opacity-0 -translate-x-4" : "w-auto opacity-100 translate-x-0"
                      )}>
                        {item.title}
                      </span>

                      {!collapsed && isActive && (
                        <ChevronRight className="w-4 h-4 text-primary-foreground/70 ml-auto animate-in fade-in slide-in-from-left-2 duration-300" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        {/* Footer */}
        <div className={cn("px-4 py-4 mt-auto transition-all duration-300", collapsed && "px-2")}>
          <div className={cn(
            "bg-white/5 rounded-2xl border border-white/5 backdrop-blur-md transition-all duration-300 overflow-hidden",
            collapsed ? "w-10 h-10 p-0 mx-auto flex items-center justify-center rounded-xl" : "p-4"
          )}>
            {collapsed ? (
              <span className="text-[10px] font-black text-primary/60">V1</span>
            ) : (
              <div className="transition-all duration-300">
                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1">Version</p>
                <p className="text-xs font-mono text-foreground/80">v0.1.0-alpha</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Toggle for Collapsed State */}
      {collapsed && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="absolute -right-3 top-6 h-6 w-6 rounded-full bg-background border border-white/10 shadow-xl text-muted-foreground hover:text-foreground hover:scale-110 transition-all z-[110] flex items-center justify-center p-0"
        >
          <PanelLeft className="w-3.5 h-3.5" />
        </Button>
      )}
    </aside>
  );
}
