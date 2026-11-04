import { describe, expect, it } from 'vitest';
import { countryLabel, gameLabel } from './audience-labels';

describe('audience labels', () => {
  it('names games with their surface', () => {
    expect(gameLabel('tic_tac_toe')).toBe('Tic Tac Toe');
    expect(gameLabel('daily:moneyDrop')).toBe('Money Drop (daily)');
    expect(gameLabel('room:tenable')).toBe('Football Tenable (friends room)');
    expect(gameLabel('duel:buscaminas')).toBe('Football Minesweeper (duel)');
    expect(gameLabel('brand_new_mode')).toBe('brand_new_mode');
  });

  it('shows a flag and English name for ISO codes and Unknown otherwise', () => {
    expect(countryLabel('GE')).toBe('🇬🇪 Georgia');
    expect(countryLabel('??')).toBe('Unknown');
  });
});
