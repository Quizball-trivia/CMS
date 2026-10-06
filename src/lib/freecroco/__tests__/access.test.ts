import { describe, expect, it } from 'vitest';
import {
  canAccessPath,
  canEditRankedPoints,
  canManageStaff,
  canResendDeliveries,
  cmsRole,
  guardRedirect,
  homeForRole,
  navGroupsForRole,
  navItemsForRole,
  rolesForPath,
} from '../access';

const groups = [
  { title: 'Content', routes: ['/categories', '/questions'] },
  { title: 'Freecroco', routes: ['/freecroco'] },
  { title: 'Users', routes: ['/users'] },
];

describe('role to navigation mapping', () => {
  it('shows partner staff only the Freecroco group', () => {
    expect(navGroupsForRole(groups, 'partner_staff').map((g) => g.title)).toEqual(['Freecroco']);
  });

  it('shows admins every group, Freecroco included', () => {
    expect(navGroupsForRole(groups, 'admin').map((g) => g.title)).toEqual(['Content', 'Freecroco', 'Users']);
  });

  it('gives any other or missing role (e.g. a removed staff member) no CMS access at all', () => {
    for (const role of [undefined, null, '', 'user', 'moderator']) {
      expect(cmsRole(role)).toBe('none');
      expect(navGroupsForRole(groups, role)).toHaveLength(0);
      expect(homeForRole(role)).toBe('/no-access');
      for (const path of ['/categories', '/freecroco', '/freecroco/staff', '/users']) expect(guardRedirect(role, path)).toBe('/no-access');
    }
  });
});

describe('route access', () => {
  it.each(['/freecroco', '/freecroco/calendar', '/freecroco/deliveries/', '/freecroco/players'])(
    'lets partner staff open %s',
    (path) => {
      expect(canAccessPath('partner_staff', path)).toBe(true);
      expect(guardRedirect('partner_staff', path)).toBeNull();
    },
  );

  it.each(['/categories', '/questions', '/users', '/stats', '/td/team', '/freecroco-evil', '/freecrocoo/x', '/'])(
    'sends partner staff from %s to /freecroco',
    (path) => {
      expect(guardRedirect('partner_staff', path)).toBe('/freecroco');
    },
  );

  it('does not let a dot-segment spelling widen the Freecroco prefix', () => {
    expect(rolesForPath('/freecroco/../users')).toEqual(['admin', 'partner_staff']);
    // Next resolves dot segments before usePathname; the server enforces regardless.
  });

  it('never redirects admins', () => {
    for (const path of ['/categories', '/freecroco', '/freecroco/calendar']) {
      expect(guardRedirect('admin', path)).toBeNull();
    }
  });

  it('sends each role home', () => {
    expect(homeForRole('partner_staff')).toBe('/freecroco');
    expect(homeForRole('admin')).toBe('/categories');
    expect(homeForRole(undefined)).toBe('/no-access');
  });

  it('allows resend for Quizball admins only', () => {
    expect(canResendDeliveries('admin')).toBe(true);
    expect(canResendDeliveries(undefined)).toBe(false);
    expect(canResendDeliveries('partner_staff')).toBe(false);
  });
});

describe('ranked points editing', () => {
  it('is for Quizball admins only', () => {
    expect(canEditRankedPoints('admin')).toBe(true);
    expect(canEditRankedPoints('partner_staff')).toBe(false);
  });
});

describe('staff accounts', () => {
  it('are managed by Quizball admins only, on screen and in the nav', () => {
    expect(canManageStaff('admin')).toBe(true);
    expect(canManageStaff('partner_staff')).toBe(false);
    for (const path of ['/freecroco/staff', '/freecroco/staff/', '/freecroco/staff/x']) {
      expect(guardRedirect('partner_staff', path)).toBe('/freecroco');
      expect(guardRedirect('admin', path)).toBeNull();
    }
    // A sibling that only shares the prefix is not the Staff page.
    expect(canAccessPath('partner_staff', '/freecroco/staffing')).toBe(true);
    const items = [{ href: '/freecroco' }, { href: '/freecroco/games' }, { href: '/freecroco/staff' }];
    expect(navItemsForRole(items, 'partner_staff').map((i) => i.href)).toEqual(['/freecroco', '/freecroco/games']);
    expect(navItemsForRole(items, 'admin')).toHaveLength(3);
  });
});
