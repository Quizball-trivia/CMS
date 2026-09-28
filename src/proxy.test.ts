// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

async function loadProxy(workspace: string | undefined) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_CMS_WORKSPACE', workspace);
  return (await import('./proxy')).proxy;
}

const request = (path: string) => new NextRequest(new URL(path, 'https://cms.example.test'));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('proxy', () => {
  it('passes Quizball routes through untouched and hides /td in quizball mode', async () => {
    const proxy = await loadProxy(undefined);
    expect(proxy(request('/categories')).headers.get('x-middleware-next')).toBe('1');
    expect(proxy(request('/')).headers.get('x-middleware-next')).toBe('1');
    expect(proxy(request('/td/team')).headers.get('x-middleware-rewrite')).toBe('https://cms.example.test/_workspace-not-found');
  });

  it('serves only /td in table-derby mode', async () => {
    const proxy = await loadProxy('table-derby');
    const root = proxy(request('/'));
    expect(root.status).toBe(307);
    expect(root.headers.get('location')).toBe('https://cms.example.test/td');
    expect(proxy(request('/td/team')).headers.get('x-middleware-next')).toBe('1');
    expect(proxy(request('/questions')).headers.get('x-middleware-rewrite')).toBe('https://cms.example.test/_workspace-not-found');
  });
});
