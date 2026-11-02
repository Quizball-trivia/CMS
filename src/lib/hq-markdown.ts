// Plain-text previews of Markdown (task results in list rows), built on a real
// CommonMark parser (the one react-markdown uses), so code blocks inside
// quotes/lists, unusual fences and inline code spans are handled to spec.
// Code blocks and raw HTML are dropped; inline text (including inline code,
// link text and image alt text) is kept, so dates, hyphenated words,
// identifiers like user__id, percentages and "#41" survive intact.
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';

type MdNode = { type: string; value?: string; alt?: string | null; children?: MdNode[] };

const DROPPED = new Set(['code', 'html', 'thematicBreak', 'definition']);
const BLOCKS = new Set(['paragraph', 'heading', 'blockquote', 'list', 'listItem', 'table', 'tableRow', 'tableCell']);

export function stripMarkdown(md: string): string {
  const parts: string[] = [];
  const walk = (node: MdNode) => {
    if (DROPPED.has(node.type)) return;
    if (node.type === 'text' || node.type === 'inlineCode') {
      parts.push(node.value ?? '');
      return;
    }
    if (node.type === 'image' || node.type === 'imageReference') {
      if (node.alt) parts.push(node.alt);
      return;
    }
    if (node.type === 'break') {
      parts.push(' ');
      return;
    }
    for (const child of node.children ?? []) walk(child);
    if (BLOCKS.has(node.type)) parts.push(' ');
  };
  // GFM too (strikethrough, tables, task lists, autolinks), like the result view's remark-gfm.
  walk(fromMarkdown(md, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }) as unknown as MdNode);
  return parts.join('').replace(/\s+/g, ' ').trim();
}
