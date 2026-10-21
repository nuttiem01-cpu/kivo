/* Pure helpers for progressive practice hints and answer flow. */
(() => {
  'use strict';

  const isLetter = character => /\p{L}/u.test(character);
  const normalize = value => String(value).normalize('NFC').replace(/[’‘ʼ＇`´]/g, "'").replace(/\s+/gu, ' ').trim().toLowerCase();
  const stripMarks = value => value.normalize('NFD').replace(/\p{M}/gu, '');

  function compareAnswers(answer, expected) {
    const actual = normalize(answer), target = normalize(expected);
    if (actual === target) return 'correct';
    if (stripMarks(actual) === stripMarks(target)) return 'near';
    return 'wrong';
  }

  function createHintState(expected, random = Math.random) {
    const answer = String(expected).normalize('NFC');
    const characters = Array.from(answer);
    const positions = characters.flatMap((character, index) => isLetter(character) ? [index] : []);
    const additional = positions.slice(1);
    for (let index = additional.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [additional[index], additional[other]] = [additional[other], additional[index]];
    }

    return {
      characters,
      positions,
      revealOrder: positions.length ? [positions[0], ...additional] : [],
      revealed: new Set(),
      level: 0,
      display: '',
      rating: ''
    };
  }

  function nextHint(state) {
    if (state.level >= 3) return state;

    state.level++;
    const total = state.positions.length;
    const percentage = state.level === 1 ? 0.35 : state.level === 2 ? 0.65 : 1;
    let target = Math.ceil(total * percentage);
    if (state.level === 1 && total > 1) target = Math.max(2, target);
    target = Math.max(state.revealed.size, target);

    for (const position of state.revealOrder.slice(0, target)) state.revealed.add(position);
    state.display = state.characters.map((character, index) => {
      if (!isLetter(character) || state.revealed.has(index)) return character;
      return '_';
    }).join('');
    state.rating = state.level === 3 ? 'wrong' : 'near';
    return state;
  }

  function applyHintCap(result, hintLevel) {
    if (hintLevel >= 3) return 'wrong';
    if (hintLevel > 0 && result === 'correct') return 'near';
    return result;
  }

  function feedbackLabel(comparison, hintLevel) {
    if (hintLevel >= 3) return 'Answer revealed';
    if (comparison === 'correct') return hintLevel > 0 ? 'Correct — hint used' : 'Correct!';
    if (comparison === 'near') return 'Almost — check the accents';
    return 'Incorrect';
  }

  function retainForRetry(queue, result) {
    if (result === 'correct') queue.shift();
    else if (queue.length > 1) queue.push(queue.shift());
    return queue;
  }

  function progressSummary(total, queue) {
    const uniqueIds = new Set(queue.map(item => item.id ?? JSON.stringify([item.pair?.key, item.pair?.value])));
    const sessionTotal = Math.max(0, Number(total) || 0);
    const remaining = Math.min(sessionTotal, uniqueIds.size);
    const mastered = sessionTotal - remaining;
    return {
      total: sessionTotal,
      remaining,
      mastered,
      percentage: sessionTotal ? Math.round(mastered / sessionTotal * 100) : 0
    };
  }

  function feedbackDetail(comparison, hintLevel) {
    if (hintLevel >= 3) return 'The revealed entry stays in the queue to try again.';
    if (comparison === 'correct' && hintLevel > 0) return 'Correct answer, but the hint keeps this entry in the retry queue.';
    if (comparison === 'near') return 'The accents differ; this entry will return later.';
    if (comparison === 'correct') return 'One more entry mastered and removed from this session.';
    return 'This entry will return later.';
  }

  function enterAction(evaluated) {
    return evaluated ? 'advance' : 'check';
  }

  function shouldRequestHint(key, answer, evaluated) {
    return key === ' ' && answer.length === 0 && !evaluated;
  }

  const helpers = { normalize, compareAnswers, createHintState, nextHint, applyHintCap, feedbackLabel, feedbackDetail, retainForRetry, progressSummary, enterAction, shouldRequestHint };
  if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
  if (typeof window !== 'undefined') window.KivoPractice = helpers;
})();
