import { describe, expect, it } from 'vitest';
import { decideWorkspaceRoute } from './workspace-guard';
import { resolveWorkspace } from './workspace';

describe('resolveWorkspace', () => {
  it('defaults to quizball and accepts table-derby', () => {
    expect(resolveWorkspace(undefined)).toBe('quizball');
    expect(resolveWorkspace('')).toBe('quizball');
    expect(resolveWorkspace('quizball')).toBe('quizball');
    expect(resolveWorkspace('table-derby')).toBe('table-derby');
  });

  it.each(['tablederby', ' table-derby', 'table-derby\n', 'Table-Derby'])('refuses %j instead of silently building Quizball', (value) => {
    expect(() => resolveWorkspace(value)).toThrow(/NEXT_PUBLIC_CMS_WORKSPACE/);
  });
});

describe('decideWorkspaceRoute in quizball mode', () => {
  it.each([
    '/',
    '/login',
    '/categories',
    '/questions/7b0c-uuid',
    '/weekend-league/content',
    '/api/bot-tuning',
    '/api/bot-tuning/roster',
    '/favicon.ico',
    '/assets/brand/quizball-logo.webp',
    '/tdx',
    '/td-archive',
    '/%E0%A4%A',
  ])('leaves %s to the Quizball CMS', (path) => {
    expect(decideWorkspaceRoute(path, 'quizball')).toEqual({ type: 'allow' });
  });

  it.each([
    '/td',
    '/td/',
    '/td/login',
    '/td/team',
    '/td/round-1/abc',
    '/td/icon.svg',
    '/%74d/team',
    '/%74%64',
  ])(
    'returns 404 for Table Derby path %s',
    (path) => {
      expect(decideWorkspaceRoute(path, 'quizball')).toEqual({ type: 'not-found' });
    },
  );
});

describe('decideWorkspaceRoute in table-derby mode', () => {
  it('sends / to /td', () => {
    expect(decideWorkspaceRoute('/', 'table-derby')).toEqual({ type: 'redirect', location: '/td' });
  });

  it.each([
    '/td',
    '/td/',
    '/td/login',
    '/td/team',
    '/td/integration',
    '/td/icon.svg',
    '/_next/webpack-hmr',
    '/__nextjs_original-stack-frames',
  ])('serves %s', (path) => {
    expect(decideWorkspaceRoute(path, 'table-derby')).toEqual({ type: 'allow' });
  });

  it.each([
    '/login',
    '/categories',
    '/questions',
    '/questions/7b0c-uuid',
    '/stats',
    '/users',
    '/weekend-league/content',
    '/api/bot-tuning',
    '/api/bot-tuning/roster',
    '/favicon.ico',
    '/assets/brand/quizball-logo.webp',
    '/tdx',
    '/td-archive',
    '/td/%2E%2E/questions',
    '/td/../questions',
    '/%E0%A4%A',
    '/_next/data/build-1/td/settings.json',
    '/_next/data/build-1/td/team.json',
    '/_next/data/build-1/index.json',
  ])('returns 404 for %s', (path) => {
    expect(decideWorkspaceRoute(path, 'table-derby')).toEqual({ type: 'not-found' });
  });
});

describe('data requests', () => {
  it.each(['quizball', 'table-derby'] as const)('answers every data URL 404 in %s mode, as the App Router does without a proxy', (workspace) => {
    for (const path of ['/_next/data/build-1/categories.json', '/_next/data/build-1/index.json', '/_next/data/build-1/td/settings.json']) {
      expect(decideWorkspaceRoute(path, workspace)).toEqual({ type: 'not-found' });
    }
    // The form the proxy actually sees: already rewritten to the page path, flagged as data.
    expect(decideWorkspaceRoute('/categories', workspace, { dataRequest: true })).toEqual({ type: 'not-found' });
    expect(decideWorkspaceRoute('/td/settings', workspace, { dataRequest: true })).toEqual({ type: 'not-found' });
  });
});
