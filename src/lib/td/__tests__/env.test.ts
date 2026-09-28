import { describe, expect, it } from 'vitest';
import { resolveTdConfig } from '../env';

const TD = { NEXT_PUBLIC_CMS_WORKSPACE: 'table-derby' };

describe('resolveTdConfig', () => {
  it('is inert in the Quizball workspace, whatever else is set', () => {
    expect(resolveTdConfig({ NEXT_PUBLIC_TD_API_MOCK: '1', NEXT_PUBLIC_CMS_ENV: 'PROD' })).toEqual({ deployEnv: 'local', apiUrl: '', mock: false });
  });

  it('allows the mock API outside production', () => {
    expect(resolveTdConfig({ ...TD, NEXT_PUBLIC_TD_API_MOCK: '1' })).toMatchObject({ mock: true, deployEnv: 'local' });
    expect(resolveTdConfig({ ...TD, NEXT_PUBLIC_TD_API_MOCK: '1', NEXT_PUBLIC_CMS_ENV: 'STAGING' })).toMatchObject({ mock: true, deployEnv: 'staging' });
    expect(resolveTdConfig({ ...TD, NEXT_PUBLIC_TD_API_MOCK: '1', VERCEL_ENV: 'preview' })).toMatchObject({ mock: true });
  });

  it.each([
    { NEXT_PUBLIC_CMS_ENV: 'PROD' },
    { NEXT_PUBLIC_CMS_ENV: 'prod' },
    { VERCEL_ENV: 'production' },
    { NEXT_PUBLIC_VERCEL_ENV: 'production' },
  ])('refuses the mock API in production (%o)', (env) => {
    expect(() => resolveTdConfig({ ...TD, NEXT_PUBLIC_TD_API_MOCK: '1', ...env })).toThrow(/not allowed in a production/);
  });

  it('needs an API URL unless mocked', () => {
    expect(() => resolveTdConfig(TD)).toThrow(/NEXT_PUBLIC_TD_API_URL/);
    expect(resolveTdConfig({ ...TD, NEXT_PUBLIC_TD_API_URL: 'https://api.example.test/' })).toEqual({
      deployEnv: 'local',
      apiUrl: 'https://api.example.test',
      mock: false,
    });
  });

  it('needs https in production', () => {
    expect(() => resolveTdConfig({ ...TD, NEXT_PUBLIC_CMS_ENV: 'PROD', NEXT_PUBLIC_TD_API_URL: 'http://api.example.test' })).toThrow(/https/);
    expect(resolveTdConfig({ ...TD, NEXT_PUBLIC_CMS_ENV: 'PROD', NEXT_PUBLIC_TD_API_URL: 'https://api.example.test' })).toMatchObject({
      deployEnv: 'production',
    });
  });
});
