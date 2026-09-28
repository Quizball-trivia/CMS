// Headless smoke test for a running Table Derby mock build (CI: `next start` of
// NEXT_PUBLIC_CMS_WORKSPACE=table-derby NEXT_PUBLIC_CMS_ENV=STAGING NEXT_PUBLIC_TD_API_MOCK=1).
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
  check('editor sees the 11 content tabs only', editorNav.length === 11 && !editorNav.includes('Team') && !editorNav.includes('Settings'), editorNav.join(', '));
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
