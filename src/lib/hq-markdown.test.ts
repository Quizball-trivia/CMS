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

describe('fenced code blocks', () => {
  it('drops backtick and tilde fences, honouring fence char and length', () => {
    const md = ['Before', '~~~', 'tilde code', '~~~', 'Middle', '````', 'has ``` inside', '````', 'After'].join('\n');
    expect(stripMarkdown(md)).toBe('Before Middle After');
  });
  it('a shorter or different closing fence does not end the block', () => {
    const md = ['A', '````', 'x', '```', 'still code', '~~~~', 'still code', '````', 'B'].join('\n');
    expect(stripMarkdown(md)).toBe('A B');
  });
});

describe('fenced code block edge cases', () => {
  it('an inline span with backticks at line start is not a fence', () => {
    expect(stripMarkdown('```value``` is the key\nMore text')).toBe('value is the key More text');
  });
  it('removes fences inside blockquotes and list items', () => {
    const md = ['Intro', '> ```js', '> const x = 1;', '> ```', '- item', '    ```', '    code', '    ```', 'Outro'].join('\n');
    expect(stripMarkdown(md)).toBe('Intro item Outro');
  });
});

describe('double underscores', () => {
  it('keeps identifiers with __ but strips __bold__', () => {
    expect(stripMarkdown('see user__id and __important__ now')).toBe('see user__id and important now');
  });
});

describe('CommonMark container and fence edge cases', () => {
  it('a fence opened right after a list marker is code', () => {
    expect(stripMarkdown(['- ```js', '  const x = 1;', '  ```', 'After the list'].join('\n'))).toBe('After the list');
  });
  it('a quoted fence line inside a top-level fence stays code', () => {
    expect(stripMarkdown(['```md', '> ```', 'inside', '```', 'Real prose'].join('\n'))).toBe('Real prose');
  });
});

describe('images', () => {
  it('keeps alt text for inline and reference-style images', () => {
    expect(stripMarkdown('![Growth chart](https://x/y.png)')).toBe('Growth chart');
    expect(stripMarkdown('![Growth][chart]\n\n[chart]: https://x/y.png')).toBe('Growth');
  });
});
