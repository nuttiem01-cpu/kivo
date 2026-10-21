const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createHintState,
  nextHint,
  compareAnswers,
  applyHintCap,
  feedbackLabel,
  feedbackDetail,
  isMasteredAnswer,
  retainForRetry,
  progressSummary,
  enterAction,
  shouldRequestHint
} = require('./practice-helpers.js');

const visibleLetters = state => [...state.display].filter(character => /\p{L}/u.test(character)).length;

test('short answers reveal the first letter and at least one more on the first hint', () => {
  const oneLetter = createHintState('a');
  nextHint(oneLetter);
  assert.equal(oneLetter.display, 'a');
  assert.equal(oneLetter.rating, 'near');

  const twoLetters = createHintState('ab', () => 0);
  nextHint(twoLetters);
  assert.equal(twoLetters.display, 'ab');
});

test('long answers use rounded-up 35%, 65%, and 100% reveal counts', () => {
  const state = createHintState('abcdefghijklmnopqrst', () => 0);
  nextHint(state);
  assert.equal(visibleLetters(state), 7);
  assert.equal(state.display, 'a_cdefgh____________');
  nextHint(state);
  assert.equal(visibleLetters(state), 13);
  nextHint(state);
  assert.equal(visibleLetters(state), 20);
  assert.equal(state.display, 'abcdefghijklmnopqrst');
});

test('the reveal order is randomized once and revealed letters remain visible', () => {
  let randomCalls = 0;
  const state = createHintState('abcdefghij', () => { randomCalls++; return 0; });
  const callsAfterSetup = randomCalls;
  nextHint(state);
  const firstHint = state.display;
  nextHint(state);
  assert.equal(randomCalls, callsAfterSetup);
  for (let index = 0; index < firstHint.length; index++) {
    if (firstHint[index] !== '_') assert.equal(state.display[index], firstHint[index]);
  }
  assert.notEqual(firstHint, 'abc_______');
});

test('accented graphemes count as letters and retain their accent', () => {
  const state = createHintState('e\u0301clair', () => 0);
  nextHint(state);
  assert.equal(state.characters[0], 'é');
  assert.equal(visibleLetters(state), 3);
  assert.equal(state.display[0], 'é');
});

test('multiword answers count letters across words while punctuation stays visible', () => {
  const state = createHintState('ab, cd!', () => 0);
  nextHint(state);
  assert.equal(visibleLetters(state), 2);
  assert.equal(state.display[2], ',');
  assert.equal(state.display[3], ' ');
  assert.equal(state.display[6], '!');
  nextHint(state);
  assert.equal(visibleLetters(state), 3);
  assert.match(state.display, /,/);
  assert.match(state.display, /!/);
});

test('repeated hints keep previous letters, then reveal everything and stop at level three', () => {
  const state = createHintState('abcdefghij', () => 0.5);
  nextHint(state);
  const first = new Set([...state.revealed]);
  nextHint(state);
  for (const position of first) assert.ok(state.revealed.has(position));
  nextHint(state);
  assert.equal(state.level, 3);
  assert.equal(state.rating, 'wrong');
  assert.equal(visibleLetters(state), 10);
  nextHint(state);
  assert.equal(state.level, 3);
});

test('hint levels cap correct answers at near and force level three to wrong', () => {
  assert.equal(applyHintCap('correct', 0), 'correct');
  assert.equal(applyHintCap('correct', 1), 'near');
  assert.equal(applyHintCap('correct', 2), 'near');
  assert.equal(applyHintCap('correct', 3), 'wrong');
  assert.equal(applyHintCap('wrong', 1), 'wrong');
  assert.equal(applyHintCap('near', 2), 'near');
});

test('hint mastery policy is opt-in, exact-only, and never applies to a revealed answer', () => {
  assert.equal(isMasteredAnswer('correct', 0), true);
  assert.equal(isMasteredAnswer('correct', 1), false);
  assert.equal(isMasteredAnswer('correct', 2), false);
  assert.equal(isMasteredAnswer('correct', 1, true), true);
  assert.equal(isMasteredAnswer('correct', 2, true), true);
  assert.equal(isMasteredAnswer('correct', 3, true), false);
  assert.equal(isMasteredAnswer('near', 1, true), false);
  assert.equal(isMasteredAnswer('wrong', 0, true), false);
});

test('feedback labels describe the answer content separately from the hint penalty', () => {
  assert.equal(feedbackLabel('correct', 0), 'Correct!');
  assert.equal(feedbackLabel('correct', 1), 'Correct — hint used');
  assert.equal(feedbackLabel('correct', 2), 'Correct — hint used');
  assert.equal(feedbackLabel('near', 0), 'Close — try once more');
  assert.equal(feedbackLabel('wrong', 0), 'Incorrect');
  assert.equal(feedbackLabel('correct', 3), 'Answer revealed');

  const comparison = 'correct';
  assert.equal(applyHintCap(comparison, 1), 'near');
});

test('answer comparison ignores typography but preserves accents and grammar', () => {
  assert.equal(compareAnswers('suivre l’avancement', 'suivre l’avancement'), 'correct');
  assert.equal(compareAnswers('ete', 'été'), 'wrong');
  assert.equal(compareAnswers('ecole', 'école'), 'near');
  assert.equal(compareAnswers('Suivre  l\' avancement !', 'suivre l’avancement!'), 'correct');
  assert.equal(compareAnswers('l’ avancement', "l'avancement"), 'correct');
  assert.equal(compareAnswers('(bonjour / merci)', '( bonjour/merci )'), 'correct');
  assert.equal(compareAnswers('bonjoue', 'bonjour'), 'near');
  assert.equal(compareAnswers('bonjouf', 'bonjour'), 'near');
  assert.equal(compareAnswers('bonsoir', 'bonjour'), 'wrong');
  assert.equal(compareAnswers('le maison', 'la maison'), 'near');
  assert.notEqual(compareAnswers('le maison', 'la maison'), 'correct');
  assert.equal(compareAnswers('je parles', 'je parle'), 'near');
  assert.notEqual(compareAnswers('je parles', 'je parle'), 'correct');
  assert.equal(compareAnswers('chut', 'chat'), 'wrong');
  assert.equal(compareAnswers('chatt', 'chat'), 'wrong');
  assert.equal(compareAnswers('pommes', 'pomme'), 'near');
  assert.equal(compareAnswers('hiver', 'été'), 'wrong');
});

test('correct answers leave the queue and near or wrong answers return to its end', () => {
  const first = { id: 1 }, second = { id: 2 }, third = { id: 3 };
  const queue = [first, second, third];
  retainForRetry(queue, 'near');
  assert.deepEqual(queue, [second, third, first]);
  retainForRetry(queue, 'wrong');
  assert.deepEqual(queue, [third, first, second]);
  retainForRetry(queue, 'correct');
  assert.deepEqual(queue, [first, second]);
  const only = [first];
  retainForRetry(only, 'wrong');
  assert.deepEqual(only, [first]);
  retainForRetry(only, 'near', true);
  assert.deepEqual(only, []);
});

test('full practice progress counts unique mastered entries, not answer attempts', () => {
  const queue = Array.from({ length: 35 }, (_, id) => ({ id, pair: { key: `k${id}`, value: `v${id}` } }));
  assert.deepEqual(progressSummary(queue.length, queue), { total: 35, remaining: 35, mastered: 0, masteredIndependently: 0, masteredWithHelp: 0, percentage: 0 });

  retainForRetry(queue, 'wrong');
  assert.deepEqual(progressSummary(35, queue), { total: 35, remaining: 35, mastered: 0, masteredIndependently: 0, masteredWithHelp: 0, percentage: 0 });
  for (let mastered = 1; mastered <= 12; mastered++) {
    retainForRetry(queue, 'correct');
    assert.equal(progressSummary(35, queue).mastered, mastered);
  }
  assert.deepEqual(progressSummary(35, queue), { total: 35, remaining: 23, mastered: 12, masteredIndependently: 12, masteredWithHelp: 0, percentage: 34 });
});

test('progressive practice uses only the entries loaded for that session', () => {
  const queue = Array.from({ length: 8 }, (_, id) => ({ id: `saved-${id}`, pair: { key: `k${id}`, value: `v${id}` } }));
  for (let index = 0; index < 4; index++) retainForRetry(queue, 'correct');
  assert.deepEqual(progressSummary(8, queue), { total: 8, remaining: 4, mastered: 4, masteredIndependently: 4, masteredWithHelp: 0, percentage: 50 });
});

test('mistake-only practice has its own denominator and correct answers clear progress', () => {
  const queue = [
    { id: 'mistake-a', pair: { key: 'a', value: 'one' } },
    { id: 'mistake-b', pair: { key: 'b', value: 'two' } }
  ];
  assert.equal(progressSummary(queue.length, queue).total, 2);
  retainForRetry(queue, 'correct');
  assert.deepEqual(progressSummary(2, queue), { total: 2, remaining: 1, mastered: 1, masteredIndependently: 1, masteredWithHelp: 0, percentage: 50 });
  retainForRetry(queue, 'correct');
  assert.deepEqual(progressSummary(2, queue), { total: 2, remaining: 0, mastered: 2, masteredIndependently: 2, masteredWithHelp: 0, percentage: 100 });
});

test('progress summary separates independent and helped mastery while total stays coherent', () => {
  const queue = [{ id: 'remaining-a' }, { id: 'remaining-b' }];
  assert.deepEqual(progressSummary(4, queue, 1), {
    total: 4, remaining: 2, mastered: 2, masteredIndependently: 1, masteredWithHelp: 1, percentage: 50
  });
  assert.equal(progressSummary(4, queue, 9).masteredWithHelp, 2);
});

test('wrong, accent-only, and hint-limited answers stay in the queue without progress', () => {
  const queue = [
    { id: 'a', pair: { key: 'a', value: 'un' } },
    { id: 'b', pair: { key: 'b', value: 'deux' } }
  ];
  const before = progressSummary(queue.length, queue);
  retainForRetry(queue, 'wrong');
  assert.deepEqual(progressSummary(2, queue), before);
  assert.equal(feedbackDetail('wrong', 0), 'This entry will return later.');

  const accentResult = compareAnswers('ecole', 'école');
  retainForRetry(queue, accentResult);
  assert.deepEqual(progressSummary(2, queue), before);
  assert.match(feedbackDetail('near', 0), /looks close/);

  const hintedResult = applyHintCap('correct', 1);
  assert.equal(hintedResult, 'near');
  retainForRetry(queue, hintedResult);
  assert.deepEqual(progressSummary(2, queue), before);
  assert.match(feedbackDetail('correct', 1), /hint keeps this entry/);
  assert.match(feedbackDetail('correct', 1, true), /counts as mastered/);
  assert.match(feedbackDetail('wrong', 3), /revealed entry stays/);
});

test('Enter checks before evaluation and advances after evaluation', () => {
  assert.equal(enterAction(false), 'check');
  assert.equal(enterAction(true), 'advance');
});

test('Space requests a hint only when the answer is empty and not evaluated', () => {
  assert.equal(shouldRequestHint(' ', '', false), true);
  assert.equal(shouldRequestHint(' ', 'bonjour', false), false);
  assert.equal(shouldRequestHint(' ', '', true), false);
  assert.equal(shouldRequestHint('a', '', false), false);
});
