'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers';
import { Sidebar, Header } from '@/components/layout';
import { Loader2 } from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50/50">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground animate-pulse font-medium">Loading your dashboard...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex bg-[#f8fafc] dark:bg-[#020617] selection:bg-primary/30 selection:text-primary">
      {/* Decorative background elements for glassmorphism */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-[20%] right-[-5%] w-[30%] h-[30%] bg-blue-400/10 rounded-full blur-[100px] animate-pulse delay-700" />
        <div className="absolute bottom-[-5%] left-[20%] w-[35%] h-[35%] bg-purple-400/10 rounded-full blur-[110px] animate-pulse delay-1000" />
      </div>

      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out">
        <Header />
        <main className="flex-1 p-6 overflow-y-auto animate-in fade-in duration-500">
          <div className="max-w-[1800px] mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
