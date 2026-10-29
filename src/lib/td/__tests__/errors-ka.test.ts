import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import contract from '../contract/pinned/admin-contract.json';

// The deployed language: the modules read it once, as they load.
let errors: typeof import('../errors');
let client: typeof import('../api-client');
let KA: Record<string, string>;
const GEORGIAN = /[ა-ჿ]/;

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_TD_LANG', 'ka');
  vi.resetModules();
  errors = await import('../errors');
  client = await import('../api-client');
  ({ KA } = await import('../i18n/ka'));
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('a refusal in the Georgian build', () => {
  it('has a Georgian title for every error code of the admin contract', () => {
    const english = contract.errors.filter((code) => {
      const view = errors.describeTdError(new client.TdApiError(400, code, 'The API says this in English'));
      return !GEORGIAN.test(view.title) || /English/.test(view.title);
    });
    expect(english).toEqual([]);
  });

  it('never shows the API’s English: a sentence it knows in Georgian, otherwise only the title', () => {
    const known = errors.describeTdError(new client.TdApiError(409, 'already_exists', 'This email is already on the team'));
    expect(known.detail).toBe(KA['This email is already on the team']);
    const unknown = errors.describeTdError(new client.TdApiError(500, 'internal', 'Something went wrong'));
    expect(unknown.title).toBe(KA['Something went wrong on the API.']);
    expect(unknown.detail).toBeNull();
    expect(errors.tdErrorText(new client.TdApiError(503, 'some_new_code', 'Brand new trouble'))).toBe(KA['Something went wrong.']);
  });

  it('gives field issues the API words in English a Georgian line, and keeps where they are', () => {
    const view = errors.describeTdError(
      new client.TdApiError(422, 'validation', 'The content is not valid', {
        issues: [
          { path: 'data.q', message: 'String must contain at least 1 character(s)' },
          { path: 'data.categoryKey', message: 'This refers to content that does not exist' },
        ],
      }),
    );
    expect(view.issues).toEqual([
      { path: 'data.q', message: KA['Not a valid value'] },
      { path: 'data.categoryKey', message: KA['This refers to content that does not exist'] },
    ]);
  });

  it('keeps text the CMS wrote in Georgian itself', () => {
    expect(errors.tdApiMessage(KA['Only a draft is published.']!)).toBe(KA['Only a draft is published.']);
    expect(errors.tdApiMessage('No such row')).toBeNull();
  });

  it('says in Georgian that the API is not answering when nothing listens on its port', async () => {
    const transport = client.createTransport('http://127.0.0.1:9', fetch);
    const caught = await transport.send('GET', '/admin/health').catch((error: unknown) => error);
    expect(errors.tdErrorText(caught)).toBe(KA['The Table Derby API is not responding; try again.']);
  });
});
