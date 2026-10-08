/**
 * Synthetic demo content for the mock API: public football trivia written for
 * the demo, sized so a release validates (a 12-card deck, 3 subjects with 5
 * clues, 10 box categories of 2, 20 penalties, practice 5/10/1, 30 days of
 * dailies). Not Table Derby's content, and never copied there.
 */
import type { TdContentData, TdContentType } from '../admin-api';

type Seed = { [T in TdContentType]: Array<TdContentData<T>> };

const LEGENDS: Array<[key: string, display: string, value: 1 | 2 | 3, aliases: string[], lines: string[]]> = [
  ['messi', 'Lionel Messi', 1, ['messi', 'lionel messi', 'მესი'], ['Argentina', 'Barcelona', '8 Ballon d’Or']],
  ['ronaldo', 'Cristiano Ronaldo', 1, ['ronaldo', 'cristiano ronaldo', 'რონალდუ'], ['Portugal', 'Real Madrid', '5 Champions Leagues']],
  ['kvaratskhelia', 'Khvicha Kvaratskhelia', 1, ['kvaratskhelia', 'khvicha', 'კვარაცხელია'], ['Georgia', 'Napoli', 'Serie A MVP 2023']],
  ['zidane', 'Zinedine Zidane', 2, ['zidane', 'zizou', 'ზიდანი'], ['France', 'Juventus', '1998 World Cup final']],
  ['kaladze', 'Kakha Kaladze', 2, ['kaladze', 'კალაძე'], ['Georgia', 'AC Milan', 'Two Champions Leagues']],
  ['ronaldinho', 'Ronaldinho', 2, ['ronaldinho', 'რონალდინიო'], ['Brazil', 'Barcelona', '2005 Ballon d’Or']],
  ['henry', 'Thierry Henry', 2, ['henry', 'thierry henry', 'ანრი'], ['France', 'Arsenal', 'Invincibles']],
  ['arveladze', 'Shota Arveladze', 3, ['arveladze', 'შოთა არველაძე'], ['Georgia', 'Ajax', 'Rangers']],
  ['kinkladze', 'Georgi Kinkladze', 3, ['kinkladze', 'kinkladze georgi', 'კინკლაძე'], ['Georgia', 'Manchester City', 'Dinamo Tbilisi']],
  ['maldini', 'Paolo Maldini', 2, ['maldini', 'მალდინი'], ['Italy', 'AC Milan', 'One club for 25 seasons']],
  ['modric', 'Luka Modrić', 1, ['modric', 'luka modric', 'მოდრიჩი'], ['Croatia', 'Real Madrid', '2018 Ballon d’Or']],
  ['mamardashvili', 'Giorgi Mamardashvili', 3, ['mamardashvili', 'მამარდაშვილი'], ['Georgia', 'Valencia', 'Euro 2024 saves']],
  ['buffon', 'Gianluigi Buffon', 2, ['buffon', 'ბუფონი'], ['Italy', 'Juventus', '2006 World Cup']],
];

/** SoFIFA faces of some of the cards, as real cards carry them (the CMS shows them through app/td/face). */
const FACES: Record<string, { id: number; ver: string }> = {
  messi: { id: 158023, ver: '24' },
  ronaldo: { id: 20801, ver: '24' },
  kvaratskhelia: { id: 247635, ver: '24' },
  modric: { id: 177003, ver: '24' },
  buffon: { id: 1179, ver: '21' },
};

const BOX: Array<[key: string, title: string, questions: Array<[q: string, display: string, aliases: string[]]>]> = [
  ['world-cups', 'World Cups', [['Who won the 2022 World Cup?', 'Argentina', ['argentina', 'არგენტინა']], ['Which country hosted the 2014 World Cup?', 'Brazil', ['brazil', 'ბრაზილია']]]],
  ['champions-league', 'Champions League', [['Which club has won the most European Cups?', 'Real Madrid', ['real madrid', 'real', 'რეალი']], ['Who won the 2005 final in Istanbul?', 'Liverpool', ['liverpool', 'ლივერპული']]]],
  ['georgian-football', 'Georgian football', [['Which Georgian club won the 1981 Cup Winners’ Cup?', 'Dinamo Tbilisi', ['dinamo tbilisi', 'dinamo', 'დინამო']], ['Which tournament was Georgia’s first major finals?', 'Euro 2024', ['euro 2024', 'ევრო 2024']]]],
  ['transfers', 'Transfers', [['Which club did Neymar join from Barcelona in 2017?', 'Paris Saint-Germain', ['psg', 'paris saint-germain', 'პსჟ']], ['Which club sold Kvaratskhelia to PSG?', 'Napoli', ['napoli', 'ნაპოლი']]]],
  ['stadiums', 'Stadiums', [['Which club plays at Anfield?', 'Liverpool', ['liverpool']], ['What is Barcelona’s stadium called?', 'Camp Nou', ['camp nou', 'კამპ ნოუ']]]],
  ['goalkeepers', 'Goalkeepers', [['Who kept goal for Spain in 2010?', 'Iker Casillas', ['casillas', 'iker casillas']], ['Which keeper is nicknamed “Gigi”?', 'Gianluigi Buffon', ['buffon']]]],
  ['coaches', 'Coaches', [['Who managed Manchester United for 26 years?', 'Alex Ferguson', ['ferguson', 'alex ferguson']], ['Who coached Barcelona’s 2009 treble side?', 'Pep Guardiola', ['guardiola', 'pep']]]],
  ['premier-league', 'Premier League', [['Which club went unbeaten in 2003–04?', 'Arsenal', ['arsenal', 'არსენალი']], ['Who is the Premier League’s record scorer?', 'Alan Shearer', ['shearer', 'alan shearer']]]],
  ['la-liga', 'La Liga', [['Which club plays at the Metropolitano?', 'Atlético Madrid', ['atletico', 'atlético madrid']], ['Which Basque club never fields foreign-born players?', 'Athletic Club', ['athletic', 'athletic bilbao']]]],
  ['serie-a', 'Serie A', [['Which club is nicknamed “La Vecchia Signora”?', 'Juventus', ['juventus', 'juve']], ['Which city is Napoli from?', 'Naples', ['naples', 'napoli', 'ნეაპოლი']]]],
];

const PENALTY_ANSWERS: Array<[q: string, display: string, aliases: string[]]> = [
  ['Capital of Georgia?', 'Tbilisi', ['tbilisi', 'თბილისი']],
  ['Messi’s shirt number at Barcelona?', '10', ['10', 'ten']],
  ['Players per side on the pitch?', '11', ['11', 'eleven']],
  ['Minutes in a regular match?', '90', ['90']],
  ['Colour of a sending-off card?', 'Red', ['red', 'წითელი']],
  ['Country of Real Madrid?', 'Spain', ['spain', 'ესპანეთი']],
  ['Ronaldo’s home country?', 'Portugal', ['portugal', 'პორტუგალია']],
  ['Which body runs the Euros?', 'UEFA', ['uefa']],
  ['Club of Kaladze in Milan?', 'AC Milan', ['milan', 'ac milan']],
  ['Yards from goal to penalty spot?', '12', ['12', 'twelve']],
  ['Nickname of the Dutch team?', 'Oranje', ['oranje', 'orange']],
  ['Home of the 2016 Euro final?', 'Paris', ['paris', 'saint-denis']],
  ['Zidane’s nickname?', 'Zizou', ['zizou']],
  ['Country of Dinamo Zagreb?', 'Croatia', ['croatia', 'ხორვატია']],
  ['Winner of Euro 2020?', 'Italy', ['italy', 'იტალია']],
  ['Sport of the Ballon d’Or?', 'Football', ['football', 'soccer', 'ფეხბურთი']],
  ['Referee’s tool for a foul?', 'Whistle', ['whistle', 'სასტვენი']],
  ['Shape of the ball?', 'Round', ['round', 'sphere']],
  ['Club of Kinkladze in England?', 'Manchester City', ['man city', 'manchester city']],
  ['Country of Bayern Munich?', 'Germany', ['germany', 'გერმანია']],
  ['Where is Anfield?', 'Liverpool', ['liverpool']],
];

const PRACTICE: Array<[difficulty: 'easy' | 'medium' | 'hard', category: string, prompt: string, options: string[], answer: number]> = [
  ['easy', 'Clubs', 'Which city is home to Dinamo Tbilisi?', ['Tbilisi', 'Batumi', 'Kutaisi'], 0],
  ['easy', 'Players', 'Which country does Kvaratskhelia play for?', ['Georgia', 'Armenia', 'Ukraine'], 0],
  ['easy', 'Rules', 'How many players does a team field?', ['9', '10', '11', '12'], 2],
  ['easy', 'Tournaments', 'How often is the World Cup held?', ['Every 2 years', 'Every 4 years', 'Every year'], 1],
  ['easy', 'Clubs', 'Which club plays at Old Trafford?', ['Manchester United', 'Liverpool', 'Arsenal'], 0],
  ['easy', 'Players', 'Which club did Messi join in 2023?', ['Inter Miami', 'PSG', 'Al-Hilal'], 0],
  ['medium', 'Tournaments', 'Who won Euro 2016?', ['France', 'Portugal', 'Germany', 'Wales'], 1],
  ['medium', 'Players', 'Which Georgian played for AC Milan in two Champions League wins?', ['Kaladze', 'Arveladze', 'Kinkladze'], 0],
  ['medium', 'Clubs', 'Which club is known as “The Old Lady”?', ['Inter', 'Juventus', 'Roma'], 1],
  ['medium', 'History', 'In which year did Dinamo Tbilisi win the Cup Winners’ Cup?', ['1979', '1981', '1986'], 1],
  ['medium', 'Tournaments', 'Where was the 2018 World Cup held?', ['Qatar', 'Russia', 'Brazil'], 1],
  ['medium', 'Players', 'Who won the 2018 Ballon d’Or?', ['Modrić', 'Messi', 'Ronaldo'], 0],
  ['medium', 'Coaches', 'Who coached Georgia at Euro 2024?', ['Willy Sagnol', 'Vladimír Weiss', 'Temuri Ketsbaia'], 0],
  ['medium', 'Clubs', 'Which club did Mamardashvili join from Valencia?', ['Liverpool', 'Chelsea', 'Arsenal'], 0],
  ['medium', 'Rules', 'How long is extra time in total?', ['20 minutes', '30 minutes', '15 minutes'], 1],
  ['medium', 'History', 'Which country won the first World Cup?', ['Uruguay', 'Brazil', 'Italy'], 0],
  ['hard', 'History', 'Who scored Georgia’s first goal at a major tournament?', ['Georges Mikautadze', 'Khvicha Kvaratskhelia', 'Budu Zivzivadze'], 0],
  ['hard', 'Clubs', 'Which club did Kinkladze join after Manchester City?', ['Ajax', 'Derby County', 'Rubin Kazan'], 0],
];

const CLUBS: Array<[key: string, label: string, country: string, countryKa: string, flag: string]> = [
  ['dinamo-tbilisi', 'Dinamo Tbilisi', 'Georgia', 'საქართველო', '🇬🇪'],
  ['napoli', 'Napoli', 'Italy', 'იტალია', '🇮🇹'],
  ['psg', 'Paris Saint-Germain', 'France', 'საფრანგეთი', '🇫🇷'],
  ['ac-milan', 'AC Milan', 'Italy', 'იტალია', '🇮🇹'],
  ['ajax', 'Ajax', 'Netherlands', 'ნიდერლანდები', '🇳🇱'],
  ['valencia', 'Valencia', 'Spain', 'ესპანეთი', '🇪🇸'],
  ['liverpool', 'Liverpool', 'England', 'ინგლისი', '🏴'],
  ['rustavi', 'Metalurgi Rustavi', 'Georgia', 'საქართველო', '🇬🇪'],
  ['torpedo-kutaisi', 'Torpedo Kutaisi', 'Georgia', 'საქართველო', '🇬🇪'],
];

export const SEED_SCHEDULE_ANCHOR = '2026-09-01';

export function seedContent(): Seed {
  return {
    'card-categories': [{ key: 'legends', prompt: 'ფეხბურთის ლეგენდები: გამოიცანი მოთამაშე' }],
    cards: LEGENDS.map(([key, display, value, aliases, lines]) => ({
      categoryKey: 'legends',
      key,
      value,
      lines,
      display,
      aliases,
      photo: FACES[key] ?? null,
      imageKey: null,
    })),
    'whoami-subjects': [
      { key: 'kvaratskhelia', display: 'Khvicha Kvaratskhelia', aliases: ['kvaratskhelia', 'khvicha', 'კვარაცხელია'], clues: ['I was born in Tbilisi in 2001.', 'I started at Dinamo Tbilisi.', 'I played in Russia for Lokomotiv Moscow and Rubin Kazan.', 'I won Serie A with Napoli.', 'They call me Kvaradona.'] },
      { key: 'kaladze', display: 'Kakha Kaladze', aliases: ['kaladze', 'კალაძე'], clues: ['I am a defender from Georgia.', 'I played for Dynamo Kyiv.', 'I moved to Milan in 2001.', 'I won the Champions League twice.', 'I later became mayor of Tbilisi.'] },
      { key: 'zidane', display: 'Zinedine Zidane', aliases: ['zidane', 'zizou'], clues: ['I was born in Marseille.', 'I played for Bordeaux and Juventus.', 'I scored twice in a World Cup final.', 'I won three Champions Leagues as a coach.', 'My last match ended with a headbutt.'] },
      { key: 'buffon', display: 'Gianluigi Buffon', aliases: ['buffon', 'gigi'], clues: ['I am a goalkeeper.', 'I started at Parma.', 'I played for Juventus for almost 20 years.', 'I won the 2006 World Cup.', 'My nickname is Gigi.'] },
    ],
    'box-categories': BOX.map(([key, title]) => ({ key, title })),
    'box-questions': BOX.flatMap(([categoryKey, , questions]) =>
      questions.map(([q, display, aliases], i) => ({ categoryKey, key: `q${i + 1}`, q, display, aliases })),
    ),
    'penalty-questions': PENALTY_ANSWERS.map(([q, display, aliases], i) => ({ key: `p${String(i + 1).padStart(2, '0')}`, q, display, aliases })),
    'practice-questions': PRACTICE.map(([difficulty, category, prompt, options, answer], i) => ({
      key: `practice-${String(i + 1).padStart(2, '0')}`,
      difficulty,
      category,
      prompt,
      options,
      answer,
      explanation: null,
      imageKey: i === 0 ? 'dinamo-stadium' : null,
    })),
    media: [
      {
        key: 'dinamo-stadium',
        url: null,
        uploadId: '00000000-0000-4000-8000-00000000f001',
        width: 16,
        height: 9,
        author: 'Table Derby demo',
        license: 'CC BY 4.0',
        source: 'Demo image generated for the mock API',
      },
    ],
    clubs: CLUBS.map(([key, label, country, countryKa, flag]) => ({
      key,
      label,
      value: label,
      country,
      countryKa,
      flag,
      crest: `${key}.webp`,
      crestImageKey: null,
      hidden: false,
    })),
    'football-logic': [
      { key: 'fl-1-a', puzzle: 'fl-1', category: 'Clubs', prompt: 'What links these two images?', imageA: '/assets/daily/football-logic/fc-barcelona.webp', imageB: '/assets/daily/football-logic/sevilla-fc.webp', imageAKey: null, imageBKey: null, displayAnswer: 'Napoli', acceptedAnswers: ['napoli', 'ნაპოლი'] },
      { key: 'fl-1-b', puzzle: 'fl-1', category: 'Players', prompt: '', imageA: null, imageB: null, imageAKey: null, imageBKey: null, displayAnswer: 'Kaladze', acceptedAnswers: ['kaladze'] },
      { key: 'fl-2-a', puzzle: 'fl-2', category: 'Stadiums', prompt: 'Which stadium is this?', imageA: null, imageB: null, imageAKey: null, imageBKey: null, displayAnswer: 'Boris Paichadze Dinamo Arena', acceptedAnswers: ['dinamo arena', 'paichadze'] },
    ],
    'put-in-order': [
      {
        key: 'pio-1-a',
        puzzle: 'pio-1',
        prompt: 'Order these World Cup winners from earliest to latest',
        items: [
          { key: 'italy-2006', label: 'Italy', sortValue: 2006 },
          { key: 'spain-2010', label: 'Spain', sortValue: 2010 },
          { key: 'germany-2014', label: 'Germany', sortValue: 2014 },
          { key: 'argentina-2022', label: 'Argentina', sortValue: 2022 },
        ],
      },
      {
        key: 'pio-2-a',
        puzzle: 'pio-2',
        prompt: 'Order these stadiums by capacity, smallest first',
        items: [
          { key: 'anfield', label: 'Anfield', sortValue: 61000 },
          { key: 'dinamo-arena', label: 'Dinamo Arena', sortValue: 54000 },
          { key: 'camp-nou', label: 'Camp Nou', sortValue: 99000 },
        ],
      },
    ],
    'career-path': [
      {
        key: 'cp-1-a',
        puzzle: 'cp-1',
        prompt: 'Whose career is this?',
        displayAnswer: 'Khvicha Kvaratskhelia',
        acceptedAnswers: ['kvaratskhelia', 'khvicha'],
        clubs: [
          { name: 'Dinamo Tbilisi', clubKey: 'dinamo-tbilisi' },
          { name: 'Rustavi', clubKey: 'rustavi' },
          { name: 'Napoli', clubKey: 'napoli' },
          { name: 'Paris Saint-Germain', clubKey: 'psg' },
        ],
      },
      {
        key: 'cp-2-a',
        puzzle: 'cp-2',
        prompt: 'Whose career is this?',
        displayAnswer: 'Shota Arveladze',
        acceptedAnswers: ['arveladze', 'shota arveladze'],
        clubs: [
          { name: 'Dinamo Tbilisi', clubKey: 'dinamo-tbilisi' },
          { name: 'Trabzonspor', clubKey: null },
          { name: 'Ajax', clubKey: 'ajax' },
        ],
      },
    ],
    'daily-schedule': [],
    'daily-settings': [
      { game: 'footballLogic', seconds: 30, cycle: { anchor: SEED_SCHEDULE_ANCHOR, sets: ['fl-1', 'fl-2'] } },
      { game: 'putInOrder', seconds: 60, cycle: { anchor: SEED_SCHEDULE_ANCHOR, sets: ['pio-1', 'pio-2'] } },
      { game: 'careerPath', seconds: null, cycle: { anchor: SEED_SCHEDULE_ANCHOR, sets: ['cp-1', 'cp-2'] } },
    ],
  };
}

/** A 16×9 PNG in the Betsson orange, served as the seeded upload's file. */
export const SEED_UPLOAD_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAFElEQVR42mP4GKVEEmIY1TAoNAAAV/DNUSF4ln8AAAAASUVORK5CYII=';
