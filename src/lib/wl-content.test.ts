import { describe, expect, it } from 'vitest';
import { autoNumberBlocks, parseWlFile } from './wl-content';

describe('autoNumberBlocks', () => {
  it('leaves already-numbered files alone', () => {
    const text = '1. A statement.\nAnswer: True\nDifficulty: Easy\n\n2. Another.\nAnswer: False\nDifficulty: Hard';
    expect(autoNumberBlocks(text)).toBe(text);
  });

  it('numbers the first line and every line after a Difficulty line', () => {
    const text = 'Order these clubs by titles (High to Low)\nDirection: desc\nItems:\n- A\n- B\n- C\n- D\nAnswer:\n1. A\n2. B\n3. C\n4. D\nDifficulty: Easy\nOrder these players by goals (High to Low)\nDirection: desc\nItems:\n- E\n- F\n- G\n- H\nAnswer:\n1. E\n2. F\n3. G\n4. H\nDifficulty: Medium';
    // The Answer block's own "1." lines must NOT count as numbering: two blocks, two numbers.
    const numbered = autoNumberBlocks(text).split('\n');
    expect(numbered[0]).toBe('1. Order these clubs by titles (High to Low)');
    expect(numbered.filter((l) => /^\d+\. Order these/.test(l))).toHaveLength(2);
    expect(numbered.filter((l) => /^2\. Order these players/.test(l))).toHaveLength(1);
    // A TF file pasted without numbers gets one number per block.
    const tf = 'Zidane scored twice.\nAnswer: True\nDifficulty: Easy\n\nKane won a trophy at Spurs.\nAnswer: False\nDifficulty: Medium';
    expect(autoNumberBlocks(tf).split('\n').filter((l) => /^\d+\. /.test(l))).toEqual(['1. Zidane scored twice.', '2. Kane won a trophy at Spurs.']);
  });
});

describe('parseWlFile', () => {
  it('accepts the editor\'s who-am-I layout: number and first clue on one line, clues numbered 5→1', () => {
    const text = [
      '13. Clue 5 : I began my career as a part-time player.',
      'Clue 4: I hold the league record for the longest clean-sheet run.',
      'Clue 3: I am the oldest player to win the Premier League.',
      'Clue 2: I won the Champions League twice, 13 years apart.',
      'Clue 1 : I am a legendary Dutch goalkeeper.',
      'Answer: Edwin van der Sar',
      'Difficulty: Medium',
    ].join('\n');
    const { questions, errors } = parseWlFile(text, 'clue_chain');
    expect(errors.filter((e) => e.severity === 'error')).toEqual([]);
    expect(questions).toHaveLength(1);
    const q = questions[0]!;
    if (q.kind !== 'clue_chain') throw new Error('kind');
    expect(q.clues[0]).toMatch(/part-time/);
    expect(q.clues[4]).toMatch(/Dutch goalkeeper/);
    expect(q.displayAnswer).toBe('Edwin van der Sar');
  });

  it('parses unnumbered true/false blocks with curly quotes', () => {
    const text = 'Real Madrid bought Di Stéfano directly from River Plate.\nAnswer: False\nDifficulty: Hard\n\nBobby Charlton is the only English Ballon d’Or winner.\nAnswer: False\nDifficulty: Hard';
    const { questions, errors } = parseWlFile(text, 'true_false');
    expect(errors).toEqual([]);
    expect(questions.map((q) => (q.kind === 'true_false' ? q.answer : null))).toEqual([false, false]);
    expect(questions[1] && 'prompt' in questions[1] ? questions[1].prompt : '').toContain("Ballon d'Or");
  });

  it('parses the career arrow format', () => {
    const { questions, errors } = parseWlFile('1. Question: Ajax ➔ Inter Milan ➔ Arsenal\nAnswer: Dennis Bergkamp | Bergkamp\nDifficulty: Easy', 'career_path');
    expect(errors).toEqual([]);
    const q = questions[0]!;
    if (q.kind !== 'career_path') throw new Error('kind');
    expect(q.clubs).toEqual(['Ajax', 'Inter Milan', 'Arsenal']);
    expect(q.acceptedAnswers).toEqual(['Dennis Bergkamp', 'Bergkamp']);
  });
});
