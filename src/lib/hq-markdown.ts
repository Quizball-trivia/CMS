// Plain-text previews of Markdown (task results in list rows). Only real
// Markdown syntax is removed, so dates, hyphenated words, snake_case,
// percentages and "#41"-style references survive intact.

const BLOCK_MARKER = /^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/;
const HORIZONTAL_RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;

/**
 * Drops fenced code blocks. A fence opens with 3+ backticks or tildes; it only
 * closes on a line of the SAME character, at least as long, with nothing but
 * whitespace after it (CommonMark). An unclosed fence runs to the end.
 */
export function stripFencedBlocks(md: string): string {
  const out: string[] = [];
  let fence: { char: string; len: number } | null = null;
  for (const line of md.split('\n')) {
    if (fence) {
      const close = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fence.char && close[1].length >= fence.len) fence = null;
      continue;
    }
    const open = line.match(/^\s{0,3}(`{3,}|~{3,})/);
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
    .replace(/\*\*|__|~~|`/g, '') // inline emphasis / code tokens
    .replace(/(^|[\s(])\*(?=\S)([^*]*?\S)\*(?=$|[\s).,!?:;])/g, '$1$2') // *italic*
    .replace(/(^|[\s(])_(?=\S)([^_]*?\S)_(?=$|[\s).,!?:;])/g, '$1$2') // _italic_ (word-bounded, so user_id survives)
    .replace(/\s+/g, ' ')
    .trim();
}
