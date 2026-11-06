// The UI audit, as functions that run inside a page. Each takes a root (a
// document or the control's shadow root) and returns plain data, so the same
// checks feed the screenshots report (shoot.js) and the test suite
// (tests/ui-audit.test.js).

// Runs in the page. `opts.pageBg` is the colour under the root when the root
// itself is transparent (the floating control sits over someone's page).
function auditInPage(opts) {
  const root = opts.shadowHost ? document.querySelector(opts.shadowHost).shadowRoot : document;
  // In CSS the body's background paints the whole canvas when the root has
  // none, so below the fold of a scrolled page the colour is the body's.
  const canvas = () => {
    const c = s => getComputedStyle(s).backgroundColor.match(/rgba?\(([^)]+)\)/);
    for (const el of [document.documentElement, document.body]) {
      const m = c(el);
      if (m) { const p = m[1].split(/[ ,/]+/).map(Number); if ((p[3] ?? 1) > 0) return [p[0], p[1], p[2], 1]; }
    }
    return [255, 255, 255, 1];
  };
  const pageBg = opts.pageBg || canvas();

  const parse = c => {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const over = (top, under) => {
    const a = top[3] + under[3] * (1 - top[3]);
    if (!a) return [0, 0, 0, 0];
    const ch = i => (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a;
    return [ch(0), ch(1), ch(2), a];
  };
  const lum = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const parent = el => el.parentElement || (el.parentNode && el.parentNode.host) || null;

  // Colour stops of a background-image gradient, as rgba arrays.
  const stops = img => (img && img !== 'none') ? (img.match(/rgba?\([^)]+\)/g) || []).map(parse) : [];

  // Every background under `el`, nearest first, ending at the page. Each entry
  // is a list of candidate colours (several for a gradient).
  function layers(el) {
    const out = [];
    for (let n = el; n; n = parent(n)) {
      if (n.nodeType !== 1) continue;
      const cs = getComputedStyle(n);
      const g = stops(cs.backgroundImage);
      const bg = parse(cs.backgroundColor);
      if (g.length) out.push(g);
      else if (bg && bg[3] > 0) out.push([bg]);
      if (bg && bg[3] >= 1 && !g.length) return out;
      if (g.length && g.every(c => c[3] >= 1)) return out;
    }
    out.push([pageBg]);
    return out;
  }

  // What is painted under the middle of `el`, top first, from el downwards.
  // Catches backgrounds that are siblings rather than ancestors, such as the
  // sliding pill behind a segmented control's chosen button. Elements with
  // pointer-events: none are not reported by elementsFromPoint, so those fall
  // back to walking the ancestors.
  const hitRoot0 = opts.shadowHost ? root : document;
  function painted(el) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return null;
    const stack = hitRoot0.elementsFromPoint(x, y);
    const at = stack.indexOf(el);
    if (at < 0) return null;
    const out = [];
    for (const n of stack.slice(at)) {
      const cs = getComputedStyle(n);
      const g = stops(cs.backgroundImage);
      const bg = parse(cs.backgroundColor);
      if (g.length) out.push(g);
      else if (bg && bg[3] > 0) out.push([bg]);
      if ((bg && bg[3] >= 1 && !g.length) || (g.length && g.every(c => c[3] >= 1))) return out;
    }
    out.push([pageBg]);
    return out;
  }

  // The background colours the text could sit on: each candidate of the
  // nearest layer composited over the layers beneath (taking the first
  // candidate of deeper layers).
  function backgrounds(el) {
    const ls = painted(el) || layers(el);
    let base = [255, 255, 255, 1];
    for (let i = ls.length - 1; i > 0; i--) base = over(ls[i][0], base);
    return ls[0].map(c => over(c, base));
  }

  const opacityOf = el => { let o = 1; for (let n = el; n; n = parent(n)) if (n.nodeType === 1) o *= +getComputedStyle(n).opacity; return o; };
  const visible = el => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || cs.display === 'none') return false;
    return opacityOf(el) > 0.05;
  };
  const label = el => {
    const t = (el.getAttribute && (el.getAttribute('aria-label') || el.id)) || '';
    const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}${t ? '#' + t : ''} "${txt}"`;
  };

  // ------------------------------------------------------------ contrast
  const contrast = [];
  const all = [...root.querySelectorAll('*')];
  for (const el of all) {
    if (!visible(el)) continue;
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const isIcon = el.tagName.toLowerCase() === 'svg';
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim());
    if (!isIcon && !hasText) continue;
    if (el.closest && el.closest('svg') && !isIcon) continue;
    const cs = getComputedStyle(el);
    let fg = parse(isIcon ? (getComputedStyle(el).color) : cs.color);
    if (!fg) continue;
    fg = [fg[0], fg[1], fg[2], fg[3] * opacityOf(el)];
    const size = parseFloat(cs.fontSize);
    const bold = +cs.fontWeight >= 700;
    const large = isIcon || size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    let worst = Infinity, against = null;
    for (const bg of backgrounds(el)) {
      const r = ratio(over(fg, bg), bg);
      if (r < worst) { worst = r; against = bg; }
    }
    contrast.push({ what: label(el), kind: isIcon ? 'icon' : (large ? 'large text' : 'text'),
      size: +size.toFixed(1), ratio: +worst.toFixed(2), need, pass: worst >= need,
      fg: fg.map(v => +(+v).toFixed(2)), bg: against.map(v => Math.round(v * 100) / 100) });
  }

  // -------------------------------------------------- clipping, overflow
  const clipped = [];
  for (const el of all) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const hides = /hidden|clip|auto|scroll/.test(cs.overflowX + cs.overflowY) || cs.textOverflow === 'ellipsis';
    if (!hides) continue;
    const hasText = (el.textContent || '').trim().length > 0;
    if (!hasText) continue;
    if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2) {
      if (el === document.body || el === document.documentElement) continue;
      clipped.push({ what: label(el), scroll: [el.scrollWidth, el.scrollHeight], client: [el.clientWidth, el.clientHeight] });
    }
  }

  // Text that runs past the edge of the window.
  const offscreen = [];
  for (const el of all) {
    if (!visible(el)) continue;
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim());
    if (!hasText) continue;
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 1 || r.left < -1) offscreen.push({ what: label(el), left: Math.round(r.left), right: Math.round(r.right), width: innerWidth });
  }

  // ------------------------------------------------------ interactive bits
  const interactive = all.filter(el => {
    if (!visible(el)) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'textarea' || tag === 'select') return true;
    if (tag === 'label' && el.querySelector('input')) return true;
    if (tag === 'input' && getComputedStyle(el).opacity !== '0' && el.type !== 'hidden') return true;
    return el.getAttribute('role') === 'button';
  });

  // The area that actually takes a click: walk out from the centre until
  // elementFromPoint stops landing on the element. Counts invisible hit-area
  // extensions, and is honest about neighbours covering it.
  const hitRoot = opts.shadowHost ? root : document;
  const owns = (el, hit) => hit && (hit === el || el.contains(hit) || (el.tagName === 'LABEL' && el.control === hit));
  function hitBox(el) {
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const reach = (dx, dy) => {
      let d = 0;
      for (let step = 1; step <= 40; step++) {
        const x = cx + dx * step, y = cy + dy * step;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) break;
        if (!owns(el, hitRoot.elementFromPoint(x, y))) break;
        d = step;
      }
      return d;
    };
    return { w: reach(-1, 0) + reach(1, 0) + 1, h: reach(0, -1) + reach(0, 1) + 1 };
  }
  const small = [];
  for (const el of interactive) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea') continue;
    const box = hitBox(el);
    if (box.w < 40 || box.h < 40) small.push({ what: label(el), hit: [box.w, box.h] });
  }

  // Interactive elements whose boxes overlap (not nested).
  const overlaps = [];
  for (let i = 0; i < interactive.length; i++) {
    for (let j = i + 1; j < interactive.length; j++) {
      const a = interactive[i], b = interactive[j];
      if (a.contains(b) || b.contains(a)) continue;
      const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
      const w = Math.min(p.right, q.right) - Math.max(p.left, q.left);
      const h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
      if (w > 1 && h > 1) overlaps.push({ a: label(a), b: label(b), overlap: [Math.round(w), Math.round(h)] });
    }
  }

  // Scrollbars on the page itself.
  const se = document.scrollingElement;
  const bodyCs = getComputedStyle(document.body);
  const scroll = {
    horizontal: se.scrollWidth > se.clientWidth + 1,
    vertical: se.scrollHeight > se.clientHeight + 1,
    bodyOverflow: bodyCs.overflowY,
    contentHeight: Math.max(document.body.scrollHeight, se.scrollHeight),
    viewport: [innerWidth, innerHeight]
  };

  return { contrast, clipped, offscreen, small, overlaps, scroll };
}

// Tabs through the page and records, for each stop, whether a focus ring
// appears: an outline of at least 2px, or a changed box-shadow, on the element
// or (for hidden inputs drawn by a sibling) on what draws it. Runs in Node.
async function focusRings(page, { shadowHost = null, max = 40 } = {}) {
  const out = [];
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  const seen = new Set();
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(host => {
      let el = document.activeElement;
      if (host) {
        // Only the control's own stops; the host page's are not ours.
        if (el !== document.querySelector(host)) return { skip: true };
        el = el.shadowRoot.activeElement;
      }
      if (!el || el === document.body) return null;
      const id = el.id || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30) || el.tagName;
      // A visually hidden input is drawn by its next sibling (the switches).
      const drawn = getComputedStyle(el).opacity === '0' && el.nextElementSibling ? el.nextElementSibling : el;
      const cs = getComputedStyle(drawn);
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) ||
        (cs.boxShadow !== 'none' && /0px 0px 0px [2-9]/.test(cs.boxShadow));
      const r = drawn.getBoundingClientRect();
      return { id, tag: el.tagName.toLowerCase(), ring, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
        onScreen: r.width > 0 && r.bottom > 0 && r.top < innerHeight };
    }, shadowHost);
    if (!stop || stop.skip) continue;
    const key = stop.tag + stop.id;
    if (seen.has(key)) break;
    seen.add(key);
    out.push(stop);
  }
  return out;
}

// Every transition and animation still moving under prefers-reduced-motion.
function motionInPage(opts) {
  const root = opts.shadowHost ? document.querySelector(opts.shadowHost).shadowRoot : document;
  const out = [];
  for (const el of root.querySelectorAll('*')) {
    for (const pseudo of [null, '::before', '::after']) {
      const cs = getComputedStyle(el, pseudo);
      const longest = Math.max(...cs.transitionDuration.split(',').map(parseFloat));
      const anim = cs.animationName !== 'none' && parseFloat(cs.animationDuration) > 0.01;
      if (anim || longest > 0.01) {
        out.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''}${pseudo || ''}: ${anim ? 'animation ' + cs.animationName : 'transition ' + cs.transitionDuration}`);
      }
    }
  }
  return [...new Set(out)];
}

module.exports = { auditInPage, focusRings, motionInPage };
