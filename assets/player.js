// òliba player: switch guide and backing at the same position, loop a section,
// slow down without changing pitch. No network, no storage, no library: one
// native <audio> per version. Inlined into every song page by `cli.mjs song-add`.
//
// <oliba-player data-unplayable="…">
//   <figure [data-sync]><figcaption>Guia · Bb</figcaption><audio controls src="guia.m4a"></audio></figure>
//   <p class="transport" hidden> clock, speed </p>
//   <p class="loop" hidden> A, B, clear </p>
//   <p class="sections" hidden> <button data-start="42" data-end="65">Refrão</button> </p>
// </oliba-player>
// Without JS every version still plays with the browser's own controls.
// Synced lyrics (.lrc [data-t]) highlight only for a version marked data-sync.

/** 62.54 → "1:02.5" @param {number} t */
const olibaClock = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

class OlibaPlayer extends HTMLElement {
  connectedCallback() {
    const figures = [...this.querySelectorAll('figure')];
    const audios = figures.map((f) => /** @type {HTMLAudioElement} */ (f.querySelector('audio')));
    if (audios.length === 0) return;
    /** @param {string} sel */
    const $ = (sel) => /** @type {HTMLElement} */ (this.querySelector(sel));
    const clock = /** @type {HTMLOutputElement} */ ($('output.clock'));
    const rateInput = /** @type {HTMLInputElement} */ ($('input.rate'));
    const rateOut = /** @type {HTMLOutputElement} */ ($('output.rate'));
    const range = /** @type {HTMLOutputElement} */ ($('output.range'));
    const page = this.closest('main') ?? document;
    const lines = /** @type {HTMLElement[]} */ ([...page.querySelectorAll('.lrc [data-t]')]);
    const offsetInput = /** @type {HTMLInputElement | null} */ (page.querySelector('input.offset'));

    let active = 0;
    /** @type {number | null} */ let a = null;
    /** @type {number | null} */ let b = null;
    let frame = 0;
    /** @type {HTMLElement | null} */ let lit = null;
    const current = () => audios[active];

    // Version toggle, built from the captions: the one move practice is made of.
    const toggle = document.createElement('p');
    toggle.className = 'versions';
    toggle.setAttribute('role', 'group');
    const buttons = figures.map((f, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = f.querySelector('figcaption')?.textContent ?? String(i + 1);
      button.addEventListener('click', () => select(i));
      toggle.append(button);
      return button;
    });
    if (figures.length > 1) {
      this.prepend(toggle);
      for (const caption of this.querySelectorAll('figcaption')) caption.hidden = true;
    }
    for (const hidden of this.querySelectorAll('p[hidden]')) hidden.removeAttribute('hidden');
    if (lines.length) offsetInput?.closest('p')?.removeAttribute('hidden');

    /** @param {number} i */
    const select = (i) => {
      const from = current();
      const to = audios[i];
      const playing = !from.paused;
      if (i !== active) {
        from.pause();
        to.currentTime = from.currentTime;
      }
      active = i;
      for (const [j, f] of figures.entries()) f.hidden = j !== i;
      for (const [j, btn] of buttons.entries()) btn.setAttribute('aria-pressed', String(j === i));
      if (playing) to.play();
      render();
    };

    const setRate = () => {
      const rate = Number(rateInput.value);
      for (const el of audios) {
        el.preservesPitch = true; // slower, same key
        el.defaultPlaybackRate = rate;
        el.playbackRate = rate;
      }
      rateOut.value = `${rate.toFixed(2)}×`;
    };

    const showRange = () => {
      range.value = a === null ? '' : `${olibaClock(a)} → ${b === null ? '…' : olibaClock(b)}`;
    };

    const render = () => {
      const t = current().currentTime;
      clock.value = olibaClock(t);
      if (!lines.length) return;
      const synced = figures[active].hasAttribute('data-sync');
      const at = t - Number(offsetInput?.value || 0);
      const line = synced ? lines.findLast((l) => Number(l.dataset.t) <= at) ?? null : null;
      if (line === lit) return;
      lit?.classList.remove('now');
      line?.classList.add('now');
      line?.scrollIntoView({ block: 'nearest' });
      lit = line;
    };

    const tick = () => {
      const el = current();
      if (a !== null && b !== null && el.currentTime >= b) el.currentTime = a;
      render();
      frame = el.paused ? 0 : requestAnimationFrame(tick);
    };

    for (const [i, el] of audios.entries()) {
      el.addEventListener('play', () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(tick);
      });
      el.addEventListener('seeked', render);
      el.addEventListener('loadedmetadata', setRate);
      // Files play as they arrive; when one doesn't, say which, in one line.
      const fail = () => {
        const note = document.createElement('p');
        note.className = 'note';
        note.textContent = `${this.dataset.unplayable ?? '✗'} ${decodeURI(el.getAttribute('src') ?? '')}`;
        figures[i].append(note);
      };
      el.addEventListener('error', fail);
      if (el.error) fail();
    }

    rateInput.addEventListener('input', setRate);
    $('.mark-a').addEventListener('click', () => {
      a = current().currentTime;
      if (b !== null && b <= a) b = null;
      showRange();
    });
    $('.mark-b').addEventListener('click', () => {
      const t = current().currentTime;
      a ??= 0;
      b = t > a ? t : null;
      showRange();
    });
    $('.clear').addEventListener('click', () => {
      a = b = null;
      showRange();
    });
    for (const button of this.querySelectorAll('.sections button')) {
      button.addEventListener('click', () => {
        const el = /** @type {HTMLElement} */ (button);
        a = Number(el.dataset.start);
        b = Number(el.dataset.end);
        showRange();
        current().currentTime = a;
        current().play();
      });
    }
    // A synced line is a seek target: click it to sing from there.
    for (const line of lines) {
      line.addEventListener('click', () => {
        if (!figures[active].hasAttribute('data-sync')) return;
        current().currentTime = Math.max(0, Number(line.dataset.t) + Number(offsetInput?.value || 0));
      });
    }
    offsetInput?.addEventListener('input', render);

    setRate();
    select(0);
  }
}

customElements.define('oliba-player', OlibaPlayer);
