import { describe, expect, it } from 'vitest';
import { decideWorkspaceRoute } from './workspace-guard';
import { resolveWorkspace } from './workspace';

describe('resolveWorkspace', () => {
  it('defaults to quizball and accepts table-derby', () => {
    expect(resolveWorkspace(undefined)).toBe('quizball');
    expect(resolveWorkspace('')).toBe('quizball');
    expect(resolveWorkspace('quizball')).toBe('quizball');
    expect(resolveWorkspace('table-derby')).toBe('table-derby');
    expect(resolveWorkspace(' table-derby\n')).toBe('table-derby');
  });

  it('refuses unknown values instead of silently building Quizball', () => {
    expect(() => resolveWorkspace('tablederby')).toThrow(/NEXT_PUBLIC_CMS_WORKSPACE/);
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

  it.each(['/td', '/td/', '/td/login', '/td/team', '/td/round-1/abc', '/td/icon.svg', '/%74d/team', '/%74%64'])(
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
    '/_next/data/build/td.json',
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
  ])('returns 404 for %s', (path) => {
    expect(decideWorkspaceRoute(path, 'table-derby')).toEqual({ type: 'not-found' });
  });
});
