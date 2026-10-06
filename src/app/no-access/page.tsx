'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldOff } from 'lucide-react';
import { useAuth } from '@/providers';
import { Button } from '@/components/ui/button';
import { cmsRole, homeForRole } from '@/lib/freecroco/access';

/** Signed in, but the account has no CMS role (or lost it): nothing to open here except signing out. */
export default function NoAccessPage() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();
  const hasAccess = cmsRole(user?.role) !== 'none';

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) router.replace('/login');
    else if (hasAccess) router.replace(homeForRole(user?.role));
  }, [isLoading, isAuthenticated, hasAccess, router, user?.role]);

  if (isLoading || !isAuthenticated || hasAccess) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm space-y-4 rounded-xl border border-gray-200 bg-white p-6 text-center">
        <ShieldOff className="mx-auto size-8 text-gray-400" />
        <h1 className="text-lg font-semibold text-gray-900">No access</h1>
        <p className="text-sm text-gray-500">
          {user?.email ?? 'This account'} has no access to the CMS. Ask a Quizball admin if you think this is a mistake.
        </p>
        <Button
          variant="outline"
          onClick={async () => {
            await logout();
            router.replace('/login');
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
