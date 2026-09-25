// òliba quiz: instant feedback inside the page. No network, no storage.
// Inlined into every lesson by `cli.mjs lesson-write`.
//
// Choice:  <fieldset class="quiz" data-answer="b">
//            <button type="button" value="b" data-why="one-line reason">…</button>
// Typed:   <fieldset class="quiz" data-answer="1500" data-why="…" data-hint="…">
//            <input> <button type="button">Check</button>
// Every quiz also carries a <details> answer for readers without JS.

/**
 * Does a typed or chosen answer match? Numbers compare as numbers (spaces as
 * thousands separators and a decimal comma are fine: "1 500", "18,0");
 * anything else compares case- and accent-insensitively.
 * @param {string} given @param {string} answer @param {number} tolerance
 */
const olibaMatches = (given, answer, tolerance) => {
  /** @param {string} s */
  const num = (s) => Number(s.replace(/[\s  ]/g, '').replace(',', '.'));
  /** @param {string} s */
  const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
  const [a, b] = [num(given), num(answer)];
  if (given.trim() && answer.trim() && Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a - b) <= tolerance;
  return norm(given) === norm(answer);
};

(() => {
  /** First attempt per quiz id, in memory only: later tries never change it. @type {Map<string, boolean>} */
  const firstAttempts = new Map();

  for (const quiz of document.querySelectorAll('fieldset.quiz')) {
    const answer = quiz.dataset.answer ?? '';
    const tolerance = Number(quiz.dataset.tolerance ?? 0);
    const input = quiz.querySelector('input');
    const output = quiz.querySelector('output') ?? quiz.insertBefore(document.createElement('output'), quiz.querySelector('details'));
    output.setAttribute('aria-live', 'polite');

    /** @param {HTMLButtonElement} button */
    const judge = (button) => {
      if (input && !input.value.trim()) return;
      const right = olibaMatches(input ? input.value : button.value, answer, tolerance);
      if (quiz.id && !firstAttempts.has(quiz.id)) firstAttempts.set(quiz.id, right);
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

  // Save my results: download the first attempts as JSON. oliba's hook picks
  // the file up from Downloads on the next prompt. Copying a /study prompt is
  // only the fallback, for when the download can't happen.
  // A blob: URL and the clipboard only; nothing leaves the machine, nothing is stored.
  const main = document.querySelector('main');
  const save = document.querySelector('button.save-results');
  const saveOutput = save?.parentElement?.querySelector('output');
  if (!main || !save || !saveOutput) return;
  saveOutput.setAttribute('aria-live', 'polite');

  /** @param {string} text */
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { /* shown below instead */ }
      area.remove();
      return ok;
    }
  };

  /** Copy the prompt; if even that fails, leave it selected in a <code> box. @param {string} prompt */
  const offerPrompt = async (prompt) => {
    const copied = await copy(prompt);
    const code = document.createElement('code');
    code.textContent = prompt;
    code.className = 'prompt';
    saveOutput.replaceChildren(copied ? '✓ ⧉ ' : '⧉ ', code);
    if (!copied) getSelection()?.selectAllChildren(code);
  };

  save.addEventListener('click', () => {
    const { project = '', lesson = '', results = 'oliba-results.json' } = main.dataset;
    const items = [...firstAttempts].map(([q, correct]) => ({ q, correct }));
    const json = JSON.stringify({ lesson, project, answeredAt: new Date().toISOString(), items }, null, 2);
    const prompt = `/oliba:study results ${project} ${lesson} ${items.map((i) => `${i.q}:${i.correct ? '✓' : '✗'}`).join(' ')}`.trim();
    try {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      link.download = results;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch {
      offerPrompt(prompt);
      return;
    }
    // Neutral confirmation, plus a small way out if the browser swallowed the download.
    const instead = document.createElement('button');
    instead.type = 'button';
    instead.className = 'copy-instead';
    instead.textContent = '⧉ /study';
    instead.addEventListener('click', () => offerPrompt(prompt));
    saveOutput.replaceChildren(`✓ ⤓ ${results} `, instead);
  });
})();
