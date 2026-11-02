import { describe, expect, it } from 'vitest';
import { boardCollision } from './hq-board-collision';

// Minimal fake of dnd-kit's collision args: one "todo" column (x 0–200) with
// three cards A, B, C stacked at y 0–50, 60–110, 120–170; the column body is
// 0–600 tall. An empty "backlog" column sits at x 220–420.
type Rect = { top: number; bottom: number; left: number; right: number; width: number; height: number };
const rect = (left: number, top: number, w: number, h: number): Rect => ({ left, top, right: left + w, bottom: top + h, width: w, height: h });
const card = (id: string, top: number) => ({ id, rect: rect(0, top, 200, 50), data: { current: { type: 'card', task: { id, status: 'todo' } } } });
const containers = [
  { id: 'column:todo', rect: rect(0, 0, 200, 600), data: { current: { type: 'column', status: 'todo' } } },
  { id: 'column:backlog', rect: rect(220, 0, 200, 600), data: { current: { type: 'column', status: 'backlog' } } },
  card('A', 0),
  card('B', 60),
  card('C', 120),
];

function run(activeId: string, x: number, y: number) {
  const droppableRects = new Map(containers.map((c) => [c.id, c.rect]));
  const droppableContainers = containers.map((c) => ({ id: c.id, data: { current: c.data.current }, rect: { current: c.rect } }));
  const args = {
    active: { id: activeId, data: { current: {} }, rect: { current: { initial: null, translated: rect(x - 100, y - 25, 200, 50) } } },
    collisionRect: rect(x - 100, y - 25, 200, 50),
    droppableRects,
    droppableContainers,
    pointerCoordinates: { x, y },
  } as unknown as Parameters<typeof boardCollision>[0];
  return boardCollision(args).map((c) => c.id);
}

describe('boardCollision', () => {
  it('pointer on a card targets that card', () => {
    expect(run('C', 100, 80)).toEqual(['B']);
  });
  it('dropping the last card below its own slot keeps it last (a no-op drop)', () => {
    expect(run('C', 100, 400)).toEqual(['C']);
  });
  it('dropping another card below the last card appends (column target)', () => {
    expect(run('A', 100, 400)).toEqual(['column:todo']);
  });
  it('moving down into a gap targets the card ABOVE the gap (placed after it)', () => {
    // A dragged down into the gap between B and C (y=115) → after B.
    expect(run('A', 100, 115)).toEqual(['B']);
  });
  it('moving up into a gap targets the card BELOW the gap (placed before it)', () => {
    // C dragged up into the gap between A and B (y=55) → before B.
    expect(run('C', 100, 55)).toEqual(['B']);
  });
  it('an empty column is a column target', () => {
    expect(run('A', 300, 300)).toEqual(['column:backlog']);
  });
  it('the gaps right next to the dragged card\'s own slot are a no-op drop', () => {
    // B dragged into the gap just below its slot (between B and C) or just above it (between A and B).
    expect(run('B', 100, 115)).toEqual(['B']);
    expect(run('B', 100, 55)).toEqual(['B']);
  });
  it('pointer back on its own slot is a no-op drop', () => {
    expect(run('B', 100, 80)).toEqual(['B']);
  });
});
