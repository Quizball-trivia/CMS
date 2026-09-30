import { checkContract, matchContractRoute, type SchemaIssue } from '../contract';

export type Role = 'editor' | 'publisher' | 'betsson_admin' | 'ops';

export interface Exchange {
  method: string;
  path: string;
  status: number;
  contentType: string | null;
  body: unknown;
}

export interface Harness {
  call(role: Role, method: string, path: string, options?: { body?: unknown; raw?: Blob; contentType?: string }): Promise<Exchange>;
  /** Lets time pass: the mock's clock moves; against a real API it waits. */
  wait(ms: number): Promise<void>;
  staffId(role: Role): Promise<string>;
  exchanges: Exchange[];
  real: boolean;
}

export interface Credentials {
  email: string;
  password: string;
}

/** Signs each role in once and records every exchange. */
export function createHarness(
  fetchImpl: typeof fetch,
  baseUrl: string,
  credentials: Record<Role, Credentials>,
  wait: (ms: number) => Promise<void>,
  real: boolean,
): Harness {
  const tokens = new Map<Role, string>();
  const ids = new Map<Role, string>();
  const exchanges: Exchange[] = [];

  async function read(response: Response): Promise<unknown> {
    const type = response.headers.get('Content-Type') ?? '';
    if (response.status === 204) return null;
    if (type.includes('json')) return response.json();
    if (type.startsWith('text/')) return response.text();
    return response.arrayBuffer();
  }

  async function token(role: Role): Promise<string> {
    const known = tokens.get(role);
    if (known) return known;
    const response = await fetchImpl(`${baseUrl}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(credentials[role]),
    });
    const body = (await response.json()) as { accessToken?: string };
    if (!response.ok || !body.accessToken) throw new Error(`${role} could not sign in (${response.status})`);
    tokens.set(role, body.accessToken);
    return body.accessToken;
  }

  const harness: Harness = {
    exchanges,
    real,
    wait,
    async staffId(role) {
      if (!ids.has(role)) ids.set(role, ((await harness.call(role, 'GET', '/admin/me')).body as { id: string }).id);
      return ids.get(role)!;
    },
    async call(role, method, path, { body, raw, contentType } = {}) {
      const headers: Record<string, string> = { Accept: 'application/json', Authorization: `Bearer ${await token(role)}` };
      if (raw) headers['Content-Type'] = contentType ?? raw.type;
      else if (body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await fetchImpl(`${baseUrl}${path}`, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
      const exchange = { method, path: path.split('?')[0], status: response.status, contentType: response.headers.get('Content-Type'), body: await read(response) };
      exchanges.push(exchange);
      return exchange;
    },
  };
  return harness;
}

/** What is wrong with an exchange against the pinned contract: the body's schema, and a refusal's code for that route and status. */
export function contractProblems(exchange: Exchange): string[] {
  const matched = matchContractRoute(exchange.method, exchange.path);
  if (!matched) return [`${exchange.method} ${exchange.path} is not a contract route`];
  const { route } = matched;
  const where = `${exchange.method} ${route.path} → ${exchange.status}`;
  const describe = (issues: SchemaIssue[]) => issues.slice(0, 5).map((i) => `${i.path || '(root)'}: ${i.message}`).join('; ');
  if (exchange.status >= 400) {
    const issues = checkContract('AdminError', exchange.body);
    if (issues.length) return [`${where}: not an AdminError (${describe(issues)})`];
    const code = (exchange.body as { code: string }).code;
    // Contract v4 omits 403 from its role-gated operations reads, which the API's staff guard answers like every other.
    if (exchange.status === 403 && code === 'forbidden' && route.roles) return [];
    const listed = route.errors[String(exchange.status)] ?? [];
    return listed.includes(code) ? [] : [`${where}: ${code} is not listed for this route (${listed.join(', ') || 'none'})`];
  }
  if (!(String(exchange.status) in route.responses)) return [`${where}: status not in the contract (${Object.keys(route.responses).join(', ')})`];
  const schema = route.responses[String(exchange.status)];
  if (schema === null) return [];
  const issues = checkContract(schema, exchange.body);
  return issues.length ? [`${where}: body is not ${schema} (${describe(issues)})`] : [];
}

/** A 16×9 PNG (the mock and the real API both decode it). */
export function pngBlob(): Blob {
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAFElEQVR42mP4GKVEEmIY1TAoNAAAV/DNUSF4ln8AAAAASUVORK5CYII=';
  return new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'image/png' });
}
