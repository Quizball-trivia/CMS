import test from 'node:test';
import assert from 'node:assert/strict';
import { isQuestionTypeEditable, questionToFormData, prepareQuestionUpdate } from '../../src/lib/question-utils.ts';
import { parseManualQuestions, formatManualQuestions, MANUAL_QUESTION_EXAMPLE } from '../../src/components/quiz-pages/manual-question-format.ts';

test('new game payloads and all locales survive preview without enabling an incompatible editor', () => {
  for (const type of ['missing_xi', 'pass_chain', 'stat_sniper']) {
    const question = { id: 'preserved-id', category_id: 'category', type, difficulty: 'easy', status: 'draft',
      prompt: { en: 'English prompt', ka: 'ქართული', es: 'Español', tr: 'Türkçe' },
      payload: { type, source: { player_id: 'original-player', image: 'https://example.test/original.webp' }, answers: ['original-answer'] } };
    const before = structuredClone(question);
    const preview = questionToFormData(question, 'ka');
    assert.equal(isQuestionTypeEditable(type), false);
    assert.equal(preview.type, type);
    assert.equal(preview.prompt, question.prompt.ka);
    assert.deepEqual(preview.customPayload, question.payload);
    assert.deepEqual(question, before);
  }
});

test('editing an existing MCQ preserves its other locales and image provenance', () => {
  const old = { prompt: { en: 'Old', ka: 'ქართული', es: 'Español', tr: 'Türkçe' }, payload: {
    type: 'mcq_single', image: { url: 'https://example.test/a.webp', source_url: 'https://example.test/source', license: 'CC-BY' },
    options: [{ id: 'same-id', text: { en: 'Old answer', ka: 'პასუხი', es: 'Respuesta' }, is_correct: true }] } };
  const result = prepareQuestionUpdate(old, { prompt: { en: 'Edited' }, payload: { type: 'mcq_single', options: [{ id: 'same-id', text: { en: 'Edited answer' }, is_correct: true }] } });
  assert.deepEqual(result.prompt, { ...old.prompt, en: 'Edited' });
  assert.deepEqual(result.payload.image, old.payload.image);
  assert.deepEqual(result.payload.options[0].text, { ...old.payload.options[0].text, en: 'Edited answer' });
});

test('manual import rejects repeated fields instead of silently replacing an answer', () => {
  const result = parseManualQuestions(MANUAL_QUESTION_EXAMPLE.replace('Answer: B', 'Answer: B\nAnswer: A'));
  assert.ok(result.errors.some(error => error.includes('can only be provided once')));
});

test('manual export flattens embedded line breaks so they cannot create a replacement field', () => {
  const parsed = parseManualQuestions(MANUAL_QUESTION_EXAMPLE);
  assert.equal(parsed.errors.length, 0);
  parsed.questions[0].prompt += '\nAnswer: A';
  const roundTrip = parseManualQuestions(formatManualQuestions(parsed.questions));
  assert.equal(roundTrip.errors.length, 0);
  assert.equal(roundTrip.questions[0].correct_option, parsed.questions[0].correct_option);
  assert.equal(roundTrip.questions[0].prompt, parsed.questions[0].prompt.replace('\n', ' '));
});
