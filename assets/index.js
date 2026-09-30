// òliba index: archive a project or retag it from the page. The page is a
// file and can't write the store, so changes queue here and "Save" downloads
// oliba-actions-<time>.json; oliba's prompt hook applies it from Downloads on
// the next message, like a lesson's results. "Copy command" copies the same
// changes as cli.mjs commands, for when the download can't happen.
// Inlined into ~/.oliba/index.html only. No network, no storage.
//
// <main data-cli data-archive data-unarchive data-remove data-saved data-copied>
//   <section data-project="<id>" data-archived="false" data-tags='["…"]'> … <p class="manage" hidden> … </p></section>
//   <footer class="actions" hidden> button.save-actions, button.copy-actions, output </footer>
// A project with two tags shows twice; both rows share one state.

(() => {
  const main = document.querySelector('main');
  const footer = document.querySelector('footer.actions');
  const rows = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('[data-project]')]);
  if (!main || !footer || rows.length === 0) return;
  const L = main.dataset;
  const save = /** @type {HTMLButtonElement} */ (footer.querySelector('button.save-actions'));
  const copyButton = /** @type {HTMLButtonElement} */ (footer.querySelector('button.copy-actions'));
  const note = /** @type {HTMLOutputElement} */ (footer.querySelector('output'));
  note.setAttribute('aria-live', 'polite');

  /** @param {string} s */
  const fold = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

  /** What the store holds, and what the page wants. @type {Map<string, { archived: boolean, tags: string[] }>} */
  const start = new Map();
  /** @type {Map<string, { archived: boolean, tags: string[] }>} */
  const want = new Map();
  for (const row of rows) {
    const id = row.dataset.project ?? '';
    if (start.has(id)) continue;
    /** @type {string[]} */
    let tags = [];
    try { tags = JSON.parse(row.dataset.tags ?? '[]'); } catch { /* none */ }
    start.set(id, { archived: row.dataset.archived === 'true', tags });
    want.set(id, { archived: row.dataset.archived === 'true', tags: [...tags] });
  }

  /** Every change since the page loaded, as absolute actions: saving twice is harmless. */
  const actions = () => [...want].flatMap(([projectId, w]) => {
    const s = /** @type {{ archived: boolean, tags: string[] }} */ (start.get(projectId));
    const retagged = w.tags.length !== s.tags.length || w.tags.some((t, i) => t !== s.tags[i]);
    return [
      ...(w.archived === s.archived ? [] : [{ op: w.archived ? 'archive' : 'unarchive', projectId }]),
      ...(retagged ? [{ op: 'tags', projectId, tags: w.tags }] : []),
    ];
  });

  /** @param {string} s */
  const quote = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
  const commands = () => actions().map((a) => a.op === 'tags'
    ? `node ${quote(L.cli ?? 'cli.mjs')} project-set ${a.projectId} --tags ${quote((a.tags ?? []).join(','))}`
    : `node ${quote(L.cli ?? 'cli.mjs')} project-archive ${a.projectId}${a.op === 'unarchive' ? ' --unarchive' : ''}`).join('\n');

  const render = () => {
    for (const row of rows) {
      const id = row.dataset.project ?? '';
      const w = /** @type {{ archived: boolean, tags: string[] }} */ (want.get(id));
      const chips = /** @type {HTMLElement} */ (row.querySelector('.chips'));
      chips.replaceChildren(...w.tags.map((tag) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `${L.remove ?? '×'}: ${tag}`);
        remove.addEventListener('click', () => {
          w.tags = w.tags.filter((t) => t !== tag);
          render();
        });
        chip.append(tag, ' ', remove);
        return chip;
      }));
      const archive = /** @type {HTMLButtonElement} */ (row.querySelector('button.archive'));
      archive.textContent = (w.archived ? L.unarchive : L.archive) ?? '';
      archive.setAttribute('aria-pressed', String(w.archived));
      const s = start.get(id);
      row.classList.toggle('changed', w.archived !== s?.archived || w.tags.join('\n') !== s?.tags.join('\n'));
    }
    const pending = actions().length > 0;
    save.disabled = !pending;
    copyButton.disabled = !pending;
  };

  for (const row of rows) {
    const id = row.dataset.project ?? '';
    const w = /** @type {{ archived: boolean, tags: string[] }} */ (want.get(id));
    row.querySelector('button.archive')?.addEventListener('click', () => {
      w.archived = !w.archived;
      render();
    });
    const input = /** @type {HTMLInputElement} */ (row.querySelector('input.tag'));
    const add = () => {
      // A comma separates tags, as on the command line.
      for (const tag of input.value.split(',').map((t) => t.trim()).filter(Boolean)) {
        if (!w.tags.some((t) => fold(t) === fold(tag))) w.tags = [...w.tags, tag.slice(0, 40)];
      }
      input.value = '';
      render();
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') add();
    });
    input.addEventListener('change', add);
    row.querySelector('p.manage')?.removeAttribute('hidden');
  }
  footer.removeAttribute('hidden');

  save.addEventListener('click', () => {
    const name = `oliba-actions-${Date.now()}.json`;
    const json = JSON.stringify({ actions: actions() }, null, 2);
    try {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      note.value = L.saved ?? '';
    } catch {
      copyButton.click();
    }
  });

  copyButton.addEventListener('click', async () => {
    const text = commands();
    try {
      await navigator.clipboard.writeText(text);
      note.value = L.copied ?? '';
    } catch {
      // No clipboard (a file page in some browsers): show the commands, selected.
      const code = document.createElement('code');
      code.className = 'prompt';
      code.textContent = text;
      note.replaceChildren(code);
      getSelection()?.selectAllChildren(code);
    }
  });

  render();
})();
