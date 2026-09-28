import { describe, expect, it } from 'vitest';
import { resolveTdConfig, tdContentSecurityPolicy } from '../env';

const TD = { NEXT_PUBLIC_CMS_WORKSPACE: 'table-derby' };
const HOSTED = { ...TD, VERCEL: '1' };

describe('resolveTdConfig', () => {
  it('is inert in the Quizball workspace, whatever else is set', () => {
    expect(resolveTdConfig({ NEXT_PUBLIC_TD_API_MOCK: ' 1 ', NEXT_PUBLIC_CMS_ENV: 'PRODUCTION', VERCEL: '1' })).toEqual({
      deployEnv: 'local',
      apiUrl: '',
      apiOrigin: null,
      mock: false,
    });
  });

  it('allows the mock API on the staging project, including its Vercel production slot', () => {
    expect(resolveTdConfig({ ...HOSTED, NEXT_PUBLIC_CMS_ENV: 'STAGING', VERCEL_ENV: 'production', NEXT_PUBLIC_TD_API_MOCK: '1' })).toMatchObject({
      deployEnv: 'staging',
      mock: true,
      apiOrigin: null,
    });
    expect(resolveTdConfig({ ...TD, NEXT_PUBLIC_TD_API_MOCK: '1' })).toMatchObject({ deployEnv: 'local', mock: true });
  });

  it('always refuses the mock API for PROD', () => {
    expect(() => resolveTdConfig({ ...HOSTED, NEXT_PUBLIC_CMS_ENV: 'PROD', NEXT_PUBLIC_TD_API_MOCK: '1' })).toThrow(/not allowed/);
    expect(() => resolveTdConfig({ ...TD, NEXT_PUBLIC_CMS_ENV: 'PROD', NEXT_PUBLIC_TD_API_MOCK: '1' })).toThrow(/not allowed/);
  });

  it.each(['PRODUCTION', 'prod', 'Staging', ' PROD', 'local'])('refuses the unknown product environment %j', (value) => {
    expect(() => resolveTdConfig({ ...TD, NEXT_PUBLIC_CMS_ENV: value, NEXT_PUBLIC_TD_API_MOCK: '1' })).toThrow(/NEXT_PUBLIC_CMS_ENV/);
  });

  it('requires an explicit product environment on hosted builds', () => {
    expect(() => resolveTdConfig({ ...HOSTED, NEXT_PUBLIC_TD_API_MOCK: '1' })).toThrow(/must set NEXT_PUBLIC_CMS_ENV/);
  });

  it.each([' 1 ', 'true', 'yes', '01', '1\n'])('refuses the non-canonical mock flag %j', (value) => {
    expect(() => resolveTdConfig({ ...TD, NEXT_PUBLIC_TD_API_MOCK: value })).toThrow(/"1", "0" or unset/);
  });

  it('treats "0" and an empty flag as off', () => {
    const real = { NEXT_PUBLIC_TD_API_URL: 'https://api.example.test' };
    expect(resolveTdConfig({ ...TD, ...real, NEXT_PUBLIC_TD_API_MOCK: '0' })).toMatchObject({ mock: false });
    expect(resolveTdConfig({ ...TD, ...real, NEXT_PUBLIC_TD_API_MOCK: '' })).toMatchObject({ mock: false });
  });

  it('needs a valid API URL unless mocked, https outside local development', () => {
    expect(() => resolveTdConfig(TD)).toThrow(/NEXT_PUBLIC_TD_API_URL/);
    expect(() => resolveTdConfig({ ...TD, NEXT_PUBLIC_TD_API_URL: 'not a url' })).toThrow(/not a valid URL/);
    expect(() => resolveTdConfig({ ...HOSTED, NEXT_PUBLIC_CMS_ENV: 'PROD', NEXT_PUBLIC_TD_API_URL: 'http://api.example.test' })).toThrow(/https/);
    expect(() => resolveTdConfig({ ...HOSTED, NEXT_PUBLIC_CMS_ENV: 'STAGING', NEXT_PUBLIC_TD_API_URL: 'http://api.example.test' })).toThrow(/https/);
    expect(resolveTdConfig({ ...TD, NEXT_PUBLIC_TD_API_URL: 'http://localhost:8080/' })).toMatchObject({
      apiUrl: 'http://localhost:8080',
      apiOrigin: 'http://localhost:8080',
    });
    expect(resolveTdConfig({ ...HOSTED, NEXT_PUBLIC_CMS_ENV: 'PROD', NEXT_PUBLIC_TD_API_URL: 'https://api.example.test/v1/' })).toEqual({
      deployEnv: 'production',
      apiUrl: 'https://api.example.test/v1',
      apiOrigin: 'https://api.example.test',
      mock: false,
    });
  });
});

describe('tdContentSecurityPolicy', () => {
  const directive = (policy: string, name: string) =>
    policy.split('; ').find((d) => d.startsWith(`${name} `));

  it('lets the browser connect only to the CMS itself and the TD API', () => {
    const config = resolveTdConfig({ ...HOSTED, NEXT_PUBLIC_CMS_ENV: 'PROD', NEXT_PUBLIC_TD_API_URL: 'https://api.example.test/v1' });
    expect(directive(tdContentSecurityPolicy(config), 'connect-src')).toBe("connect-src 'self' https://api.example.test");
  });

  it('allows only the CMS itself when mocked', () => {
    const config = resolveTdConfig({ ...HOSTED, NEXT_PUBLIC_CMS_ENV: 'STAGING', NEXT_PUBLIC_TD_API_MOCK: '1' });
    expect(directive(tdContentSecurityPolicy(config), 'connect-src')).toBe("connect-src 'self'");
  });

  it('keeps foreign scripts, images and framing out, and no eval outside local development', () => {
    const config = resolveTdConfig({ ...HOSTED, NEXT_PUBLIC_CMS_ENV: 'PROD', NEXT_PUBLIC_TD_API_URL: 'https://api.example.test/v1' });
    const policy = tdContentSecurityPolicy(config);
    expect(directive(policy, 'default-src')).toBe("default-src 'self'");
    expect(directive(policy, 'img-src')).toBe("img-src 'self' data: blob:");
    expect(directive(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(policy, 'object-src')).toBe("object-src 'none'");
    expect(directive(policy, 'base-uri')).toBe("base-uri 'self'");
    expect(directive(policy, 'script-src')).not.toContain('unsafe-eval');
  });

  it('allows eval and the dev socket under next dev, whatever API the build uses', () => {
    const config = resolveTdConfig({ ...HOSTED, NEXT_PUBLIC_CMS_ENV: 'STAGING', NEXT_PUBLIC_TD_API_MOCK: '1' });
    const policy = tdContentSecurityPolicy(config, true);
    expect(directive(policy, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(policy, 'connect-src')).toContain('ws:');
  });
});
