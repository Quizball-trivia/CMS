'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers';
import { Loader2 } from 'lucide-react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/categories');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50/50">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground animate-pulse">Loading QuizBall CMS...</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-100 via-white to-gray-100 dark:from-slate-950 dark:via-slate-900 dark:to-black p-4 overflow-hidden relative">
      {/* Dynamic Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-500/20 rounded-full blur-[120px] animate-pulse delay-1000" />
        <div className="absolute top-[30%] right-[10%] w-[30%] h-[30%] bg-purple-500/10 rounded-full blur-[100px] animate-bounce-slow" />
      </div>

      <div className="w-full max-w-md space-y-8 relative">
        <div className="flex flex-col items-center justify-center space-y-4 text-center animate-in fade-in slide-in-from-bottom-4 duration-700 relative z-10">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-blue-600 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative rounded-2xl bg-card p-4 shadow-2xl backdrop-blur-xl border border-white/20">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-10 w-10 text-primary"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-4xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/50">
              QuizBall
            </h1>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground/40">
              Content Management System
            </p>
          </div>
        </div>
        
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000 fill-mode-both relative z-10">
          {children}
        </div>
      </div>
    </div>
  );
}
