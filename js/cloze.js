(function (root) {
  function normalize(value) {
    return String(value ?? '').normalize('NFKC')
      .replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"')
      .trim().replace(/\s+/g, ' ');
  }

  function hasAny(value) {
    return Array.isArray(value) && value.some(answer => normalize(answer) !== '');
  }

  function isComplete(question, value) {
    return Array.isArray(value) && question.blankCount > 0
      && Array.from({ length: question.blankCount }, (_, i) => value[i])
        .every(answer => normalize(answer) !== '');
  }

  function grade(question, value, key) {
    if (!Array.isArray(key) || key.length !== question.blankCount || key.some(word => !normalize(word))) {
      return { status: 'ungraded', user: value || [], correct: null };
    }
    const user = Array.isArray(value) ? value : [];
    const slots = key.map((correct, index) => ({
      user: String(user[index] ?? ''), correct,
      ok: normalize(user[index]) === normalize(correct),
    }));
    const earned = slots.filter(slot => slot.ok).length;
    return {
      status: earned === key.length ? 'correct' : earned > 0 ? 'partial' : 'wrong',
      user: slots.map(slot => slot.user), correct: key, slots, earned, total: key.length,
    };
  }

  const api = { normalize, hasAny, isComplete, grade };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CBTCloze = api;
})(typeof window !== 'undefined' ? window : null);
