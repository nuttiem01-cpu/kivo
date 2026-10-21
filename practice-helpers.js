/* Pure helpers for progressive practice hints and answer flow. */
(() => {
  'use strict';

  const isLetter = character => /\p{L}/u.test(character);
  const normalize = value => String(value).normalize('NFC')
    .replace(/[’‘ʼ＇`´]/g, "'")
    .replace(/\s*(\p{P})\s*/gu, '$1')
    .replace(/\s+/gu, ' ').trim().toLowerCase();
  function levenshteinDistance(left, right) {
    const a = Array.from(left), b = Array.from(right);
    if (Math.abs(a.length - b.length) > 2) return 3;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let row = 1; row <= a.length; row++) {
      const current = [row];
      for (let column = 1; column <= b.length; column++) {
        current[column] = Math.min(
          current[column - 1] + 1,
          previous[column] + 1,
          previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1)
        );
      }
      previous = current;
    }
    return previous[b.length];
  }

  function nearMatchLimit(expected) {
    const letters = Array.from(expected).filter(isLetter).length;
    if (letters < 5) return 0;
    return letters < 12 ? 1 : 2;
  }

  function compareAnswers(answer, expected) {
    const actual = normalize(answer), target = normalize(expected);
    if (actual === target) return 'correct';
    const limit = nearMatchLimit(target);
    return limit && levenshteinDistance(actual, target) <= limit ? 'near' : 'wrong';
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
    if (comparison === 'near') return 'Close — try once more';
    return 'Incorrect';
  }

  function isMasteredAnswer(comparison, hintLevel, allowWithHelp = false) {
    if (comparison !== 'correct' || hintLevel >= 3) return false;
    return hintLevel === 0 || Boolean(allowWithHelp);
  }

  function retainForRetry(queue, result, mastered = result === 'correct') {
    if (mastered) queue.shift();
    else if (queue.length > 1) queue.push(queue.shift());
    return queue;
  }

  function progressSummary(total, queue, masteredWithHelp = 0) {
    const uniqueIds = new Set(queue.map(item => item.id ?? JSON.stringify([item.pair?.key, item.pair?.value])));
    const sessionTotal = Math.max(0, Number(total) || 0);
    const remaining = Math.min(sessionTotal, uniqueIds.size);
    const mastered = sessionTotal - remaining;
    const assisted = Math.min(mastered, Math.max(0, Number(masteredWithHelp) || 0));
    return {
      total: sessionTotal,
      remaining,
      mastered,
      masteredIndependently: mastered - assisted,
      masteredWithHelp: assisted,
      percentage: sessionTotal ? Math.round(mastered / sessionTotal * 100) : 0
    };
  }

  function feedbackDetail(comparison, hintLevel, masteredWithHelp = false) {
    if (hintLevel >= 3) return 'The revealed entry stays in the queue to try again.';
    if (comparison === 'correct' && hintLevel > 0) return masteredWithHelp
      ? 'Correct with help. This entry counts as mastered.'
      : 'Correct answer, but the hint keeps this entry in the retry queue.';
    if (comparison === 'near') return 'This looks close; the entry stays in the queue.';
    if (comparison === 'correct') return 'One more entry mastered and removed from this session.';
    return 'This entry will return later.';
  }

  function enterAction(evaluated) {
    return evaluated ? 'advance' : 'check';
  }

  function shouldRequestHint(key, answer, evaluated) {
    return key === ' ' && answer.length === 0 && !evaluated;
  }

  const helpers = { normalize, compareAnswers, createHintState, nextHint, applyHintCap, feedbackLabel, feedbackDetail, isMasteredAnswer, retainForRetry, progressSummary, enterAction, shouldRequestHint };
  if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
  if (typeof window !== 'undefined') window.KivoPractice = helpers;
})();
