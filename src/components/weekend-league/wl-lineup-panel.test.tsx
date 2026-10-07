import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { lineupTemplate } from '@/lib/wl-lineup';

vi.mock('@/lib/wl-content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/wl-content')>();
  return {
    ...actual,
    wlContentApi: {
      GET: vi.fn(async () => ({ data: { events: [{ id: '00000000-0000-4000-8000-000000000001', week_key: '2026-09-26', status: 'entry_open', answers: 0, editable: true, reason: null, games: [] }] } })),
      POST: vi.fn(),
    },
  };
});

import { WlLineupPanel } from './wl-lineup-panel';

describe('WlLineupPanel file input', () => {
  it('re-reads a file chosen again under the same name after it was fixed', async () => {
    render(<WlLineupPanel />);
    fireEvent.change(await screen.findByLabelText('2. Games to upload'), { target: { value: 'game_1' } });
    const input = screen.getByLabelText('Lineup file') as HTMLInputElement;
    // jsdom always fires change events; in a browser, re-picking the same path fires none unless
    // the handler cleared the input — so assert the clearing itself.
    const cleared = vi.fn();
    Object.defineProperty(input, 'value', { configurable: true, get: () => '', set: cleared });

    const broken = new File(['=== SATURDAY GAME 2 ===\n--- Round 1: True or False ---\n1. Only one statement.\nAnswer: Maybe\nDifficulty: Easy\n'], 'lineup.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [broken] } });
    expect(await screen.findByText(/problems? in lineup\.txt/)).toBeTruthy();
    expect(cleared).toHaveBeenCalledWith('');

    const fixedText = lineupTemplate('game_1').text;
    const fixed = new File([fixedText], 'lineup.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [fixed] } });
    await waitFor(() => expect(screen.getByText(/lineup\.txt: 2[12] questions for Saturday Game 2/)).toBeTruthy());
    expect(screen.queryByText(/problems? in lineup\.txt/)).toBeNull();
  });
});
