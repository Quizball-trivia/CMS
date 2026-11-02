// Plain-text previews of Markdown (task results in list rows). Only real
// Markdown syntax is removed, so dates, hyphenated words, snake_case,
// percentages and "#41"-style references survive intact.

const BLOCK_MARKER = /^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/;
const HORIZONTAL_RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;

/**
 * Drops fenced code blocks (CommonMark-ish, tuned for previews):
 * - container prefixes (blockquote '>' markers, list indentation) are ignored
 *   when recognising fences, so fences inside quotes and lists are removed too;
 * - a backtick fence's info string may not contain backticks (so an inline
 *   span like ```value``` at the start of a line is NOT a fence);
 * - a fence closes only on the same character, at least as long, with nothing
 *   but whitespace after it; an unclosed fence runs to the end.
 */
export function stripFencedBlocks(md: string): string {
  const out: string[] = [];
  let fence: { char: string; len: number } | null = null;
  for (const line of md.split('\n')) {
    const body = line.replace(/^\s*(?:>\s?)*\s*/, '');
    if (fence) {
      const close = body.match(/^(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fence.char && close[1].length >= fence.len) fence = null;
      continue;
    }
    const open = body.match(/^(`{3,})([^`]*)$/) ?? body.match(/^(~{3,})(.*)$/);
    if (open) {
      fence = { char: open[1][0], len: open[1].length };
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

export function stripMarkdown(md: string): string {
  const text = stripFencedBlocks(md)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images → alt text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // links → their text (before anything else)

  const lines = text.split('\n').map((line) => {
    if (HORIZONTAL_RULE.test(line)) return '';
    let out = line;
    // Block markers only at the start of a line; repeat for nesting like "> - item".
    for (let i = 0; i < 3 && BLOCK_MARKER.test(out); i++) out = out.replace(BLOCK_MARKER, '');
    return out;
  });

  return lines
    .join(' ')
    .replace(/\*\*|~~|`/g, '') // inline emphasis / code tokens
    .replace(/(^|[\s(])__(?=\S)(.*?\S)__(?=$|[\s).,!?:;])/g, '$1$2') // __bold__ (word-bounded, so user__id survives)
    .replace(/(^|[\s(])\*(?=\S)([^*]*?\S)\*(?=$|[\s).,!?:;])/g, '$1$2') // *italic*
    .replace(/(^|[\s(])_(?=\S)([^_]*?\S)_(?=$|[\s).,!?:;])/g, '$1$2') // _italic_ (word-bounded, so user_id survives)
    .replace(/\s+/g, ' ')
    .trim();
}
