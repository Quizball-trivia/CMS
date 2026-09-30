// Headless smoke test for a running Table Derby mock build (CI: `next start` of
// NEXT_PUBLIC_CMS_WORKSPACE=table-derby NEXT_PUBLIC_TD_API_MOCK=1, a local build: the mock is
// refused in any hosted build or with NEXT_PUBLIC_CMS_ENV set).
// Usage: node scripts/td-smoke.mjs [baseUrl]. Needs the `playwright` package and a Chromium.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:3310';
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

async function status(path) {
  const response = await fetch(`${BASE}${path}`, { redirect: 'manual' });
  return { code: response.status, location: response.headers.get('location'), csp: response.headers.get('content-security-policy') };
}

async function signIn(page, email) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname.startsWith('/td') && !url.pathname.startsWith('/td/login'));
}

const navLabels = async (page) => (await page.locator('aside nav a').allInnerTexts()).map((text) => text.split('\n')[0].trim());

const buildId = readFileSync('.next/BUILD_ID', 'utf8').trim();
const root = await status('/');
check('/ redirects to /td', root.code === 307 && root.location?.endsWith('/td'), `${root.code} ${root.location}`);
for (const path of ['/questions', '/login', '/api/bot-tuning', `/_next/data/${buildId}/td/settings.json`]) {
  check(`${path.replace(buildId, '<build>')} is 404`, (await status(path)).code === 404);
}
const login = await status('/td/login');
const policy = new Map((login.csp ?? '').split(';').map((d) => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values.join(' ')]));
check(
  '/td/login is 200 with the TD policy (own connect-src, no framing, no foreign scripts)',
  login.code === 200 &&
    policy.get('connect-src') === "'self'" &&
    policy.get('frame-ancestors') === "'none'" &&
    policy.get('default-src') === "'self'" &&
    !(policy.get('script-src') ?? '').includes('unsafe-eval'),
  login.csp ?? 'no CSP',
);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => /Content Security Policy/i.test(message.text()) && errors.push(message.text()));

  await page.goto(`${BASE}/td/team`);
  await page.waitForURL(/\/td\/login\?next=%2Ftd%2Fteam/);
  check('anonymous visit goes to the login page', true);

  await signIn(page, 'editor@demo.tablederby.test');
  await page.getByText('You do not have access to this section').waitFor();
  check('editor is denied Team', true);
  const editorNav = await navLabels(page);
  check('editor sees the 11 content tabs only', editorNav.length === 11 && !editorNav.includes('Team') && !editorNav.includes('Settings') && !editorNav.includes('Integration'), editorNav.join(', '));
  await page.goto(`${BASE}/td/integration`);
  await page.getByText('You do not have access to this section').waitFor();
  check('editor opening Integration directly is denied, and no webhook event is read', !(await page.getByText(/^td-evt-/).count()));
  await page.locator('aside nav a', { hasText: 'Clubs' }).click();
  await page.waitForURL(/\/td\/clubs$/);
  await page.getByRole('heading', { level: 1, name: 'Clubs' }).waitFor();
  check('navigation opens a tab', true);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/td\/login/);
  await signIn(page, 'admin@demo.tablederby.test');
  await page.goto(`${BASE}/td/team`);
  await page.getByText('invited@demo.tablederby.test').waitFor();
  check('Betsson admin sees the staff list', (await page.locator('table tbody tr').count()) === 5);
  const adminNav = await navLabels(page);
  check('Betsson admin has Team and Integration but not Settings', adminNav.includes('Team') && adminNav.includes('Integration') && !adminNav.includes('Settings'));
  await page.goto(`${BASE}/td/integration`);
  await page.getByText('td-evt-0056', { exact: true }).waitFor();
  await page.getByLabel('Search webhook events').fill('td-evt-0004');
  await page.keyboard.press('Enter');
  await page.getByText('td-evt-0004', { exact: true }).first().click();
  const event = page.locator('[data-slot="sheet-content"]');
  await event.getByText('Envelope sent').waitFor();
  check(
    'Betsson admin searches webhook events and opens one with its attempts, without retry',
    (await event.locator('tbody tr').count()) === 31 && (await event.getByRole('button', { name: /Retry/ }).count()) === 0,
  );
  await page.keyboard.press('Escape');

  // Content workflow on the mock API: an editor drafts and marks ready, a publisher approves and publishes.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/td\/login/);
  await signIn(page, 'editor@demo.tablederby.test');
  await page.goto(`${BASE}/td/penalties`);
  await page.getByRole('button', { name: 'New question' }).click();
  const sheet = page.locator('[data-slot="sheet-content"]');
  await sheet.getByRole('textbox', { name: 'Question', exact: true }).fill('Smoke test question?');
  await sheet.getByRole('textbox', { name: 'Answer (as shown)', exact: true }).fill('Smoke');
  await sheet.getByRole('textbox', { name: 'Accepted spellings', exact: true }).fill('smoke,');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await page.getByRole('button', { name: 'Mark ready' }).click();
  await page.getByText('Ready for a publisher to approve.').waitFor();
  check('editor creates a draft and marks it ready; no approve for editors', (await page.getByRole('button', { name: 'Approve' }).count()) === 0);
  await page.keyboard.press('Escape');

  await page.goto(`${BASE}/td/media`);
  await page.locator('main img[alt="dinamo-stadium"]').waitFor();
  check('media previews come through the staff token as blob URLs', (await page.locator('main img[alt="dinamo-stadium"]').getAttribute('src'))?.startsWith('blob:') === true);

  await page.goto(`${BASE}/td/import`);
  await page.getByLabel(/Or paste the cells here/).fill('key\tq\tdisplay\taliases\nsmoke-imp\tImported?\tYes\tyes');
  await page.getByRole('button', { name: 'Read the pasted cells' }).click();
  await page.getByRole('button', { name: 'Check' }).click();
  await page.getByText(/1 ready to import · 0 with problems/).waitFor();
  check('import reads pasted cells and the API previews them', true);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/td\/login/);
  await signIn(page, 'publisher@demo.tablederby.test');
  await page.goto(`${BASE}/td/penalties`);
  await page.getByText('Smoke test question?').click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.locator('[data-slot="sheet-content"]').getByText('Approved', { exact: true }).waitFor();
  check('publisher approves the ready question', true);
  await page.keyboard.press('Escape');

  await page.goto(`${BASE}/td/releases`);
  await page.getByText('Valid: it can be published.').waitFor();
  await page.getByRole('button', { name: 'Publish' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish' }).click();
  await page.getByText(/is current now\./).waitFor({ timeout: 20_000 });
  check('publisher publishes and sees every phase to current', true);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/td\/login/);
  await signIn(page, 'ops@demo.tablederby.test');
  await page.goto(`${BASE}/td/players`);
  await page.getByLabel('Search players').fill('N');
  await page.keyboard.press('Enter');
  await page.getByRole('cell', { name: 'Nino', exact: true }).click();
  await page.getByText(/vs /).first().click();
  await page.getByRole('button', { name: 'Correct the result' }).waitFor();
  check('ops finds a player and opens a match record with its replay and correction form', (await page.getByRole('heading', { name: 'Replay', exact: true }).count()) === 1);
  await page.keyboard.press('Escape');
  await page.goto(`${BASE}/td/settings`);
  await page.getByText('Tickets per day').first().waitFor();
  check('ops sees the settings', true);
  await page.goto(`${BASE}/td/integration`);
  await page.getByLabel('Search webhook events').fill('td-evt-0018');
  await page.keyboard.press('Enter');
  await page.getByText('td-evt-0018', { exact: true }).first().click();
  const retried = page.locator('[data-slot="sheet-content"]');
  await retried.getByRole('button', { name: 'Retry now' }).click();
  // The mock partner answers the next attempt: delivered, with that attempt added.
  await retried.getByText('Delivered: nothing to retry.').waitFor();
  check('ops retries a given-up webhook event and sees it delivered', (await retried.getByText('HTTP 200').count()) === 1 && (await retried.locator('tbody tr').count()) === 32);

  check('no page errors or CSP violations', errors.length === 0, errors.join(' | '));
} catch (error) {
  check('smoke run completed', false, error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`${failures.length} smoke check(s) failed`);
  process.exit(1);
}
