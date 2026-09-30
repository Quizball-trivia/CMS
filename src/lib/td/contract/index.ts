import artifact from './pinned/admin-contract.json';
import type { AdminError } from './pinned/admin-contract';
import { validateSchema, type JsonSchema, type SchemaIssue } from './validate';
import { TD_ADMIN_CONTRACT_VERSION } from './version';

export type * from './pinned/admin-contract';
export { TD_ADMIN_CONTRACT_VERSION };
export type { SchemaIssue };

export type TdAdminErrorCode = AdminError['code'];
type Role = 'editor' | 'publisher' | 'betsson_admin' | 'ops';

/** One route of the pinned contract, as the artifact describes it. */
export interface ContractRoute {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  auth: 'none' | 'staff';
  /** null: any signed-in member. */
  roles: Role[] | null;
  request: string | null;
  responses: Record<string, string | null>;
  errors: Record<string, string[]>;
  type?: string;
  action?: string;
  query?: string;
  produces?: string;
  consumes?: string;
}

interface Artifact {
  contract: string;
  version: number;
  errors: string[];
  routes: ContractRoute[];
  schemas: Record<string, JsonSchema>;
}

// The artifact's own JSON type is huge and says nothing the interface above does not.
export const TD_CONTRACT = artifact as unknown as Artifact;

export type TdSchemaName = keyof typeof artifact.schemas;

export function contractSchema(name: TdSchemaName | string): JsonSchema {
  const schema = TD_CONTRACT.schemas[name];
  if (!schema) throw new Error(`The admin contract has no schema ${name}`);
  return schema;
}

/** Issues of `value` against a contract schema; empty when the API would accept it. */
export function checkContract(name: TdSchemaName | string, value: unknown): SchemaIssue[] {
  return validateSchema(contractSchema(name), value);
}

const routePatterns = TD_CONTRACT.routes.map((route) => ({
  route,
  names: [...route.path.matchAll(/:([a-zA-Z]+)/g)].map((m) => m[1]),
  regex: new RegExp(`^${route.path.replace(/:[a-zA-Z]+/g, '([^/]+)')}$`),
}));

/** The contract route a request reaches, with its path parameters. */
export function matchContractRoute(method: string, pathname: string): { route: ContractRoute; params: Record<string, string> } | null {
  for (const { route, names, regex } of routePatterns) {
    if (route.method !== method) continue;
    const m = regex.exec(pathname);
    if (!m) continue;
    // A literal segment (`/imports/preview`) wins over a parameter (`/imports/:id`): exact paths first.
    const params = Object.fromEntries(names.map((name, i) => [name, decodeURIComponent(m[i + 1])]));
    if (names.length > 0 && routePatterns.some((p) => p.route.method === method && p.route.path === pathname)) continue;
    return { route, params };
  }
  return null;
}
