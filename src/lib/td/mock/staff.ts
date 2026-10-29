import type { TdStaffMember } from '@/types/td';

/**
 * The mock API's accounts (password `demo`). Ids are UUIDs, as the API's are.
 * Betsson's team has one role, so the first active `betsson_admin` is the one
 * a test signs in as; the other two are colleagues whose work it sees.
 */
export const MOCK_STAFF: readonly TdStaffMember[] = [
  { id: '5e1d0000-0000-4000-8000-000000000003', email: 'admin@demo.tablederby.test', name: 'Demo Betsson Admin', role: 'betsson_admin', status: 'active', lastSignInAt: '2026-09-25T11:20:00Z' },
  { id: '5e1d0000-0000-4000-8000-000000000001', email: 'editor@demo.tablederby.test', name: 'Demo Editor', role: 'betsson_admin', status: 'active', lastSignInAt: '2026-09-27T08:40:00Z' },
  { id: '5e1d0000-0000-4000-8000-000000000002', email: 'colleague@demo.tablederby.test', name: 'Demo Colleague', role: 'betsson_admin', status: 'active', lastSignInAt: '2026-09-26T16:05:00Z' },
  { id: '5e1d0000-0000-4000-8000-000000000004', email: 'ops@demo.tablederby.test', name: 'Demo Ops', role: 'ops', status: 'active', lastSignInAt: '2026-09-28T07:15:00Z' },
  { id: '5e1d0000-0000-4000-8000-000000000005', email: 'invited@demo.tablederby.test', name: 'Invited Editor', role: 'betsson_admin', status: 'invited', lastSignInAt: null },
];
