import { afterEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactNode } from 'react';

const h = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({ isAuthenticated: false, isLoading: true })),
  Providers: function Providers({ children }: { children: ReactNode }) {
    return children;
  },
}));

vi.mock('@/providers', () => ({ Providers: h.Providers, useAuth: h.useAuth }));
vi.mock('next/font/google', () => ({ Inter: () => ({ variable: 'inter' }), Geist_Mono: () => ({ variable: 'mono' }) }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

async function inWorkspace(workspace: string | undefined) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_CMS_WORKSPACE', workspace);
  return {
    RootLayout: (await import('../layout')).default,
    DashboardLayout: (await import('../(dashboard)/layout')).default,
    AuthLayout: (await import('../(auth)/layout')).default,
    HomePage: (await import('../page')).default,
  };
}

function containsElementOfType(node: unknown, type: unknown): boolean {
  if (Array.isArray(node)) return node.some((child) => containsElementOfType(child, type));
  if (!isValidElement(node)) return false;
  return node.type === type || containsElementOfType((node.props as { children?: unknown }).children, type);
}

afterEach(() => {
  vi.unstubAllEnvs();
  h.useAuth.mockClear();
});

describe('Table Derby build isolation', () => {
  it('never mounts the Quizball providers in the root layout, not even for 404s', async () => {
    const { RootLayout } = await inWorkspace('table-derby');
    expect(containsElementOfType(RootLayout({ children: <p>404</p> }), h.Providers)).toBe(false);
  });

  it('keeps the Quizball providers in the Quizball root layout', async () => {
    const { RootLayout } = await inWorkspace(undefined);
    expect(containsElementOfType(RootLayout({ children: <p>page</p> }), h.Providers)).toBe(true);
  });

  it('refuses the Quizball route groups before any Quizball hook runs', async () => {
    const { DashboardLayout, AuthLayout, HomePage } = await inWorkspace('table-derby');
    expect(() => DashboardLayout({ children: null })).toThrow('NEXT_NOT_FOUND');
    expect(() => AuthLayout({ children: null })).toThrow('NEXT_NOT_FOUND');
    expect(() => HomePage()).toThrow('NEXT_REDIRECT /td');
    expect(h.useAuth).not.toHaveBeenCalled();
  });
});
