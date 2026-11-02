import { describe, expect, it } from 'vitest';
import { stripMarkdown } from './hq-markdown';

describe('stripMarkdown', () => {
  it('keeps ordinary text intact: dates, hyphens, snake_case, percentages, #refs, pipes', () => {
    const text = 'On 2026-11-03 the well-known user_id field dropped -5% in task #41 (A | B > C)';
    expect(stripMarkdown(text)).toBe(text);
  });

  it('removes block markers only at the start of a line', () => {
    expect(stripMarkdown('# Daily briefing\n## Numbers\n- new users up\n* matches flat\n+ ratings ok\n1. first\n> quoted')).toBe(
      'Daily briefing Numbers new users up matches flat ratings ok first quoted'
    );
    expect(stripMarkdown('> - nested item')).toBe('nested item');
    expect(stripMarkdown('a - b and 3. c')).toBe('a - b and 3. c');
  });

  it('turns links and images into their text before anything else', () => {
    expect(stripMarkdown('See [the post-mortem](https://x.io/a-b_c) and ![chart](https://x.io/c.png)')).toBe('See the post-mortem and chart');
  });

  it('drops horizontal rules and inline emphasis/code tokens', () => {
    expect(stripMarkdown('**Headline:** up _a lot_\n\n---\n\n`code` and ~~old~~ *new*')).toBe('Headline: up a lot code and old new');
    expect(stripMarkdown('***')).toBe('');
  });

  it('removes fenced code blocks and collapses whitespace', () => {
    expect(stripMarkdown('Before\n```ts\nconst a = 1;\n```\nAfter')).toBe('Before After');
  });
});
