'use client';

import { Suspense, useEffect } from 'react';
import { notFound, usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers';
import { Sidebar, Header, EnvironmentBanner } from '@/components/layout';
import { cmsRole, guardRedirect } from '@/lib/freecroco/access';
import { departmentForPath } from '@/lib/hq-departments';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// Loaded on demand: it pulls in HQ's task dialog and Markdown stack, which no
// other CMS page needs; it only renders for admins on department tool pages.
const DepartmentBar = dynamic(() => import('@/components/hq/department-bar').then((m) => m.DepartmentBar), { ssr: false });

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // A Table Derby build still compiles this route group but must never render it. The literal
  // comparison is folded at build time, so a Quizball build compiles to exactly what it was.
  if (process.env.NEXT_PUBLIC_CMS_WORKSPACE === 'table-derby') notFound();
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Partner staff may only see the Freecroco section; the server enforces it too.
  const redirectTo = isAuthenticated ? guardRedirect(user?.role, pathname) : null;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    } else if (redirectTo) {
      router.replace(redirectTo);
    }
  }, [isAuthenticated, isLoading, redirectTo, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50/50">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground animate-pulse font-medium">Loading your dashboard...</p>
      </div>
    );
  }

  // Render nothing while redirecting so a forbidden page never mounts or fires its queries.
  if (!isAuthenticated || redirectTo) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] dark:bg-[#020617] selection:bg-primary/30 selection:text-primary">
      <EnvironmentBanner />

      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out">
          <Header />
          <main className="flex-1 p-4 md:p-6 overflow-y-auto">
            <div className="max-w-[1800px] mx-auto space-y-6">
              {/* Ties each existing tool page to its HQ department (admins only; not on HQ pages). */}
              {cmsRole(user?.role) === 'admin' && departmentForPath(pathname) && (
                <Suspense fallback={null}>
                  <DepartmentBar pathname={pathname} />
                </Suspense>
              )}
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
