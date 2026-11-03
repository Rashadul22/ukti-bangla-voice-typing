// Shared motion for the popup, the setup page and the corrections page.
// It only adds classes and two custom properties; the styles are fx.css.
// Nothing here touches settings, storage or the network.
(() => {
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Entrance order: the selectors are tried on every page, so each page
  // gets the ones it has, top to bottom.
  const ENTER = 'body > header, header, .site, .tabs, .pane.on > .group, .pane.on > .cta, .col > .card, main > .card, .cta, .by, footer';
  const seen = new Set();
  let i = 0;
  for (const el of document.querySelectorAll(ENTER)) {
    if (seen.has(el)) continue;
    seen.add(el);
    el.style.setProperty('--i', String(i++));
    el.classList.add('fx-in');
    // Drop the class when done, so a later class change (a pane shown
    // again) does not replay it, and nothing keeps a filter.
    el.addEventListener('animationend', e => {
      if (e.target === el && e.animationName === 'fx-in') el.classList.remove('fx-in');
    });
  }

  for (const m of document.querySelectorAll('.mark')) m.classList.add('fx-glint');
  for (const b of document.querySelectorAll('.cta, .card button, main button, main .btn')) b.classList.add('fx-shine');

  // The spotlight follows the pointer only while it is over a card.
  for (const card of document.querySelectorAll('.group, .site, .card')) {
    card.classList.add('fx-spot');
    card.addEventListener('pointerenter', () => card.classList.add('lit'));
    card.addEventListener('pointerleave', () => card.classList.remove('lit'));
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${Math.round(e.clientX - r.left)}px`);
      card.style.setProperty('--my', `${Math.round(e.clientY - r.top)}px`);
    });
  }

  // A status line replays its fade each time its words change.
  for (const s of document.querySelectorAll('#status, .status')) {
    new MutationObserver(() => {
      if (calm()) return;
      s.classList.remove('fx-say');
      void s.offsetWidth;
      s.classList.add('fx-say');
    }).observe(s, { childList: true, characterData: true, subtree: true });
  }

})();
