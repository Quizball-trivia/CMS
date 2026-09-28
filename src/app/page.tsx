'use client';

import { useEffect } from 'react';
import { redirect, useRouter } from 'next/navigation';
import { useAuth } from '@/providers';

export default function HomePage() {
  // Unreachable in a Table Derby build (the proxy redirects first); this covers prerendering.
  // Folded at build time like the route-group guards.
  if (process.env.NEXT_PUBLIC_CMS_WORKSPACE === 'table-derby') redirect('/td');
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.push('/categories');
      } else {
        router.push('/login');
      }
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
    </div>
  );
}
