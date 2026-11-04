const GAME_LABELS: Record<string, string> = {
  ranked: 'Ranked', friendly: 'Friendly match', party_quiz: 'Party Quiz', tic_tac_toe: 'Tic Tac Toe', auction: 'Auction',
  weekend_league: 'Weekend League', buscaminas: 'Football Minesweeper', minuto: 'What Minute?', guess_the_goal: 'Guess the Goal',
  tenable: 'Football Tenable', shared_player: 'Played for Both', ultimo: 'Last Answer Standing', pistas: 'Football Clues',
  name_chain: 'Name Chain', football_race: 'Football Horserace', codenames: 'Football Codenames', dato_falso: 'Odd One Out',
  conexiones: 'Football Connections', darts501: 'Football Darts 501', grid_daily: 'Daily Grid', squad_spin: 'Squad Spin',
  trivia_mines: 'Trivia Mines', free_kicks: 'Free Kicks', road_to_goal: 'Road to Goal', aproximado: 'Closest Wins',
  moneyDrop: 'Money Drop', trueFalse: 'True or False', countdown: 'Countdown', careerPath: 'Career Path',
  cardDetective: 'Card Detective', missingXi: 'Missing XI', passChain: 'Pass Chain', statSniper: 'Stat Sniper',
  clues: 'Who Am I?', imposter: 'Imposter', highLow: 'Higher or Lower', footballLogic: 'Football Logic',
};

/** daily:<type>, room:<game> and duel:<game> keep the surface next to the game's name. */
export function gameLabel(mode: string): string {
  const [surface, game] = mode.includes(':') ? mode.split(':', 2) : [null, mode];
  const name = GAME_LABELS[game] ?? game;
  if (surface === 'daily') return `${name} (daily)`;
  if (surface === 'room') return `${name} (friends room)`;
  if (surface === 'duel') return `${name} (duel)`;
  return name;
}

const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;

export function countryLabel(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return 'Unknown';
  const flag = String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  let name = code;
  try {
    name = regionNames?.of(code) ?? code;
  } catch {
    name = code;
  }
  return `${flag} ${name}`;
}
