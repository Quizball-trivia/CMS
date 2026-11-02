import { expect, it, vi } from 'vitest';

vi.mock('@/hooks', () => ({ useCreateHqMember: () => ({ mutate: vi.fn(), isPending: false }) }));
const { slugify } = await import('../team/hire-agent-dialog');

it('slugifies names with accents into readable handles', () => {
  expect(slugify('Müller')).toBe('muller');
  expect(slugify('Crème Brûlée Agent')).toBe('creme-brulee-agent');
  expect(slugify('  Community Manager!  ')).toBe('community-manager');
  expect(slugify('x'.repeat(60))).toHaveLength(41);
});
