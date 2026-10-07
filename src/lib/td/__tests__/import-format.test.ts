import { describe, expect, it } from 'vitest';
import { checkContract } from '../contract';
import { parseDelimited, parseItemsJson, parseSheet, sheetTemplate, TD_IMPORTABLE_TYPES } from '../import-format';

describe('spreadsheet import', () => {
  it('reads quoted fields, doubled quotes and line breaks, with the delimiter from the header', () => {
    expect(parseDelimited('a,b\r\n"x, y","say ""hi"""\n"two\nlines",z\n').rows).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['two\nlines', 'z'],
    ]);
    expect(parseDelimited('﻿a\tb\n1\t2').delimiter).toBe('\t');
    expect(parseDelimited('a;b\n1;2').rows[1]).toEqual(['1', '2']);
  });

  it('gives each record the physical line it starts on: line breaks in quoted cells and blank lines count', () => {
    const parsed = parseDelimited('a,b\r\n"two\r\nlines",x\n\n\n"three\nmore\nlines",y\rlast,z');
    expect(parsed.rows.map((r) => r[1])).toEqual(['b', 'x', 'y', 'z']);
    expect(parsed.lines).toEqual([1, 2, 6, 9]);
  });

  it('reports a sheet problem at the line a spreadsheet shows, not the record count', () => {
    // The first item spans two lines; a blank line follows; the bad value is on line 5.
    const sheet = 'key,q,display,aliases,position\nok-1,"A question\nover two lines",One,one,1\n\nbad-1,Second?,Two,two,not-a-number';
    const parsed = parseSheet('penalty-questions', sheet);
    expect(parsed.problems).toEqual([expect.objectContaining({ line: 5, column: 'position' })]);
    expect(parsed.lines).toEqual([2]);
  });

  it('turns every template into an item the contract accepts', () => {
    for (const type of TD_IMPORTABLE_TYPES) {
      const parsed = parseSheet(type, sheetTemplate(type));
      expect(parsed.problems, type).toEqual([]);
      expect(checkContract('ContentImportItem', parsed.items[0]), type).toEqual([]);
    }
  });

  it('splits lists on | (\\| is a bar), reads nested short forms, empty optional cells as null', () => {
    const cards = parseSheet('cards', 'categoryKey,key,value,display,aliases,lines,photoId,photoVer,imageKey,note\nlegends,messi,1,Messi,messi|leo,A \\| B|Barça,158023,25_1,,checked');
    expect(cards.items[0]).toEqual({
      type: 'cards',
      data: { categoryKey: 'legends', key: 'messi', value: 1, display: 'Messi', aliases: ['messi', 'leo'], lines: ['A | B', 'Barça'], photo: { id: 158023, ver: '25_1' }, imageKey: null },
      note: 'checked',
    });
    const order = parseSheet('put-in-order', 'key,puzzle,prompt,items\nr1,p1,Order,Italy=2006|Spain=2010');
    expect((order.items[0] as { data: { items: unknown } }).data.items).toEqual([
      { key: 'item-1', label: 'Italy', sortValue: 2006 },
      { key: 'item-2', label: 'Spain', sortValue: 2010 },
    ]);
    const path = parseSheet('career-path', 'key,puzzle,prompt,displayAnswer,acceptedAnswers,clubs\ncp,p,Who?,Kvara,kvara,Dinamo Tbilisi=dinamo-tbilisi|Rubin Kazan');
    expect((path.items[0] as { data: { clubs: unknown } }).data.clubs).toEqual([
      { name: 'Dinamo Tbilisi', clubKey: 'dinamo-tbilisi' },
      { name: 'Rubin Kazan', clubKey: null },
    ]);
    const practice = parseSheet('practice-questions', 'key,difficulty,category,prompt,options,answer\nq,easy,C,P?,a|b|c,3');
    expect((practice.items[0] as { data: { answer: number } }).data.answer).toBe(2);
  });

  it('names the line and column of what it cannot read, and refuses unknown or missing columns', () => {
    const parsed = parseSheet('penalty-questions', 'key,q,display,aliases,position\np1,Q,A,a,first\np2,Q,A,a,2');
    expect(parsed.problems).toEqual([{ line: 2, column: 'position', message: '“first” is not a number' }]);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.lines).toEqual([3]);
    expect(parseSheet('penalty-questions', 'key,q,colour\np1,Q,red').problems.map((p) => p.message)).toEqual([
      '“colour” is not a column of this type',
      'The column “display” is missing',
      'The column “aliases” is missing',
    ]);
  });

  it('takes a JSON list of items (types may mix) and refuses more than the API takes', () => {
    expect(parseItemsJson('{"items":[{"type":"clubs"},{"type":"cards"}]}').items).toHaveLength(2);
    expect(parseItemsJson('nope').problems[0].message).toMatch(/not valid JSON/);
    expect(parseItemsJson(JSON.stringify(Array.from({ length: 2001 }, () => ({})))).problems[0].message).toMatch(/At most 2000/);
  });
});
