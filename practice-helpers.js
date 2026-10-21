/* Pure helpers for progressive practice hints and answer flow. */
(() => {
  'use strict';

  const isLetter = character => /\p{L}/u.test(character);

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

  function enterAction(evaluated) {
    return evaluated ? 'advance' : 'check';
  }

  function shouldRequestHint(key, answer, evaluated) {
    return key === ' ' && answer.length === 0 && !evaluated;
  }

  const helpers = { createHintState, nextHint, applyHintCap, feedbackLabel, retainForRetry, enterAction, shouldRequestHint };
  if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
  if (typeof window !== 'undefined') window.KivoPractice = helpers;
})();
