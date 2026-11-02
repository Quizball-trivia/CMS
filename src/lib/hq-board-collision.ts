import { closestCorners, pointerWithin, type CollisionDetection } from '@dnd-kit/core';

/**
 * What's under the pointer wins (a card, else the column it's in), so a card
 * dropped on an empty column next to a tall one lands there. Keyboard drags
 * have no pointer and fall back to closest corners.
 */
export const boardCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length === 0) return closestCorners(args);
  const isCard = (h: (typeof hits)[number]) => h.data?.droppableContainer?.data?.current?.type === 'card';
  const others = hits.filter((h) => isCard(h) && h.id !== args.active.id);
  if (others.length) return others;
  // Pointer still over the dragged card's own slot: a no-op drop, not "move to the end".
  const self = hits.filter((h) => h.id === args.active.id);
  if (self.length) return self;
  // Pointer over a column but in a gap between (or below) its cards. Pick a
  // target that makes the drop land IN that gap, given how handleDragEnd
  // places it (same column: moving up → before target, down → after target;
  // other column: before/after by midpoint). Below the last card → the column
  // itself (append). An empty column stays the column target.
  const column = hits.find((h) => h.data?.droppableContainer?.data?.current?.type === 'column');
  const status = column?.data?.droppableContainer?.data?.current?.status;
  const p = args.pointerCoordinates;
  if (status && p) {
    const inColumn = args.droppableContainers
      .filter((c) => {
        const d = c.data.current as { type?: string; task?: { status?: string } } | undefined;
        return d?.type === 'card' && d.task?.status === status;
      })
      .map((c) => ({ c, r: args.droppableRects.get(c.id) }))
      .filter((x): x is { c: (typeof args.droppableContainers)[number]; r: NonNullable<typeof x.r> } => !!x.r)
      .sort((a, b) => a.r.top - b.r.top);
    const others = inColumn.filter((x) => x.c.id !== args.active.id);
    // A gap touching the dragged card's own slot (between its neighbours) is
    // "put it back": a no-op drop, never a move past a neighbour.
    const slot = inColumn.findIndex((x) => x.c.id === args.active.id);
    if (slot >= 0) {
      const prev = inColumn[slot - 1];
      const next = inColumn[slot + 1];
      const top = prev ? prev.r.bottom : -Infinity;
      const bottom = next ? next.r.top : Infinity;
      if (p.y >= top && p.y <= bottom && (prev || next)) {
        return [{ id: args.active.id, data: { droppableContainer: inColumn[slot].c, value: 0 } }];
      }
    }
    if (others.length) {
      const below = others.find((x) => x.r.top >= p.y);
      if (!below) return column ? [column] : hits;
      const activeSlot = inColumn.find((x) => x.c.id === args.active.id);
      const above = [...others].reverse().find((x) => x.r.bottom <= p.y);
      const hit = (x: { c: (typeof args.droppableContainers)[number] }) => [{ id: x.c.id, data: { droppableContainer: x.c, value: 0 } }];
      // Moving down within the column: "after the card above the gap".
      if (activeSlot && below.r.top > activeSlot.r.top && above) return hit(above);
      // Moving up, or from another column: "before the card below the gap".
      return hit(below);
    }
  }
  return hits;
};
