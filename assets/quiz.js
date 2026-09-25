// òliba quiz: instant feedback inside the page. No network, no storage.
// Inlined into every lesson by `cli.mjs lesson-write`.
//
// Choice:  <fieldset class="quiz" data-answer="b">
//            <button type="button" value="b" data-why="one-line reason">…</button>
// Typed:   <fieldset class="quiz" data-answer="1500" data-why="…" data-hint="…">
//            <input> <button type="button">Check</button>
// Every quiz also carries a <details> answer for readers without JS.

(() => {
  /** @param {string} s */
  const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
  /** @param {string} s */
  const num = (s) => Number(s.replace(/[\s  ]/g, '').replace(',', '.'));

  /** @param {string} given @param {string} answer @param {number} tolerance */
  const matches = (given, answer, tolerance) => {
    const [a, b] = [num(given), num(answer)];
    if (given.trim() && Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a - b) <= tolerance;
    return norm(given) === norm(answer);
  };

  for (const quiz of document.querySelectorAll('fieldset.quiz')) {
    const answer = quiz.dataset.answer ?? '';
    const tolerance = Number(quiz.dataset.tolerance ?? 0);
    const input = quiz.querySelector('input');
    const output = quiz.querySelector('output') ?? quiz.insertBefore(document.createElement('output'), quiz.querySelector('details'));
    output.setAttribute('aria-live', 'polite');

    /** @param {HTMLButtonElement} button */
    const judge = (button) => {
      const right = matches(input ? input.value : button.value, answer, tolerance);
      const reason = input
        ? (right ? quiz.dataset.why : quiz.dataset.hint) ?? ''
        : button.dataset.why ?? '';
      for (const b of quiz.querySelectorAll('button')) b.classList.remove('right', 'wrong');
      (input ?? button).classList.remove('right', 'wrong');
      (input ?? button).classList.add(right ? 'right' : 'wrong');
      output.className = right ? 'right' : 'wrong';
      // Symbols, not words: the page speaks the learner's language, this file doesn't.
      output.textContent = `${right ? '✓' : '✗'} ${reason}`.trim();
    };

    quiz.addEventListener('click', (event) => {
      const button = /** @type {HTMLElement} */ (event.target).closest('button');
      if (button && quiz.contains(button)) judge(/** @type {HTMLButtonElement} */ (button));
    });
    input?.addEventListener('keydown', (event) => {
      const button = quiz.querySelector('button');
      if (event.key === 'Enter' && button) judge(button);
    });
  }
})();
