// òliba manage: change things from the pages. On the index, archive a project
// or retag it; on the repertoire and a song's page, move a song between
// statuses or retag it; on the repertoire, filter songs by tag. The pages are
// files and can't write the store, so changes queue here and "Save" downloads
// oliba-actions-<time>.json; oliba's prompt hook applies it from Downloads on
// the next message, like a lesson's results. "Copy command" copies the same
// changes as cli.mjs commands, for when the download can't happen.
// Inlined into the index, the repertoire and every song page. No network;
// localStorage only remembers the repertoire's tag filter.
//
// <main data-cli data-archive data-unarchive data-remove data-saved data-copied>
//   <… data-project="<id>" data-archived data-tags='[…]'> <p class="manage" hidden> button.archive, .chips, input.tag </p>
//   <… data-song="<id>" data-status data-tags='[…]'> <p class="manage" hidden> button[data-status]…, .chips, input.tag </p>
//   <p class="filter" hidden> button[data-filter=""] button[data-filter="<folded tag>"]… </p>
//   <footer class="actions" hidden> button.save-actions, button.copy-actions, output </footer>
// One thing can show twice (a project under two tags); both rows share one state.

(() => {
  const main = document.querySelector('main');
  if (!main) return;
  const L = main.dataset;

  /** @param {string} s */
  const fold = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  const store = {
    get: (/** @type {string} */ key) => { try { return localStorage.getItem(key); } catch { return null; } },
    set: (/** @type {string} */ key, /** @type {string} */ value) => { try { localStorage.setItem(key, value); } catch { /* not remembered */ } },
  };

  // Repertoire: show only the songs with one tag. Uses the saved tags.
  const filter = document.querySelector('p.filter');
  if (filter) {
    const key = `oliba-filter:${location.pathname}`;
    /** @param {string} tag folded; '' for all */
    const show = (tag) => {
      for (const b of filter.querySelectorAll('button')) b.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (b).dataset.filter === tag));
      for (const li of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('li[data-song]'))) {
        /** @type {string[]} */
        let tags = [];
        try { tags = JSON.parse(li.dataset.tags ?? '[]'); } catch { /* none */ }
        li.hidden = tag !== '' && !tags.some((t) => fold(t) === tag);
      }
      for (const group of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('section.status-group'))) {
        group.hidden = [...group.querySelectorAll('li[data-song]')].every((li) => /** @type {HTMLElement} */ (li).hidden);
      }
    };
    for (const b of filter.querySelectorAll('button')) {
      b.addEventListener('click', () => {
        const tag = /** @type {HTMLElement} */ (b).dataset.filter ?? '';
        store.set(key, tag);
        show(tag);
      });
    }
    const saved = store.get(key) ?? '';
    show([...filter.querySelectorAll('button')].some((b) => /** @type {HTMLElement} */ (b).dataset.filter === saved) ? saved : '');
    filter.removeAttribute('hidden');
  }

  const footer = document.querySelector('footer.actions');
  const rows = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('[data-project], [data-song]')]);
  if (!footer || rows.length === 0) return;
  const save = /** @type {HTMLButtonElement} */ (footer.querySelector('button.save-actions'));
  const copyButton = /** @type {HTMLButtonElement} */ (footer.querySelector('button.copy-actions'));
  const note = /** @type {HTMLOutputElement} */ (footer.querySelector('output'));
  note.setAttribute('aria-live', 'polite');

  /** @typedef {{ kind: 'project' | 'song', id: string, archived: boolean, status: string, tags: string[] }} Item */
  /** @param {HTMLElement} row */
  const keyOf = (row) => (row.dataset.project ? `project:${row.dataset.project}` : `song:${row.dataset.song}`);
  /** What the store holds, and what the page wants. @type {Map<string, Item>} */
  const start = new Map();
  /** @type {Map<string, Item>} */
  const want = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (start.has(key)) continue;
    /** @type {string[]} */
    let tags = [];
    try { tags = JSON.parse(row.dataset.tags ?? '[]'); } catch { /* none */ }
    const item = {
      kind: /** @type {'project' | 'song'} */ (row.dataset.project ? 'project' : 'song'),
      id: row.dataset.project ?? row.dataset.song ?? '',
      archived: row.dataset.archived === 'true',
      status: row.dataset.status ?? '',
      tags,
    };
    start.set(key, item);
    want.set(key, { ...item, tags: [...tags] });
  }

  /** @param {Item} a @param {Item} b */
  const retagged = (a, b) => a.tags.length !== b.tags.length || a.tags.some((t, i) => t !== b.tags[i]);

  /** Every change since the page loaded, as absolute actions: saving twice is harmless. */
  const actions = () => [...want].flatMap(([key, w]) => {
    const s = /** @type {Item} */ (start.get(key));
    if (w.kind === 'song') {
      return [
        ...(w.status === s.status ? [] : [{ op: 'song-status', songId: w.id, status: w.status }]),
        ...(retagged(w, s) ? [{ op: 'song-tags', songId: w.id, tags: w.tags }] : []),
      ];
    }
    return [
      ...(w.archived === s.archived ? [] : [{ op: w.archived ? 'archive' : 'unarchive', projectId: w.id }]),
      ...(retagged(w, s) ? [{ op: 'tags', projectId: w.id, tags: w.tags }] : []),
    ];
  });

  /** @param {string} s */
  const quote = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
  const cli = `node ${quote(L.cli ?? 'cli.mjs')}`;
  const commands = () => actions().map((/** @type {any} */ a) => {
    const tags = quote((a.tags ?? []).join(','));
    switch (a.op) {
      case 'song-status': return `${cli} song-set ${a.songId} --status ${a.status}`;
      case 'song-tags': return `${cli} song-set ${a.songId} --tags ${tags}`;
      case 'tags': return `${cli} project-set ${a.projectId} --tags ${tags}`;
      default: return `${cli} project-archive ${a.projectId}${a.op === 'unarchive' ? ' --unarchive' : ''}`;
    }
  }).join('\n');

  const render = () => {
    for (const row of rows) {
      const w = /** @type {Item} */ (want.get(keyOf(row)));
      const s = /** @type {Item} */ (start.get(keyOf(row)));
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
      const archive = row.querySelector('button.archive');
      if (archive) {
        archive.textContent = (w.archived ? L.unarchive : L.archive) ?? '';
        archive.setAttribute('aria-pressed', String(w.archived));
      }
      for (const b of row.querySelectorAll('button[data-status]')) {
        b.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (b).dataset.status === w.status));
      }
      row.classList.toggle('changed', w.archived !== s.archived || w.status !== s.status || retagged(w, s));
    }
    const pending = actions().length > 0;
    save.disabled = !pending;
    copyButton.disabled = !pending;
    // Sticky only while there is something to save, so it never sits over the page's last lines for nothing.
    footer.classList.toggle('pending', pending);
  };

  for (const row of rows) {
    const w = /** @type {Item} */ (want.get(keyOf(row)));
    row.querySelector('button.archive')?.addEventListener('click', () => {
      w.archived = !w.archived;
      render();
    });
    for (const b of row.querySelectorAll('button[data-status]')) {
      b.addEventListener('click', () => {
        w.status = /** @type {HTMLElement} */ (b).dataset.status ?? w.status;
        render();
      });
    }
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
