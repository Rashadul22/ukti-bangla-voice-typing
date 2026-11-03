// The live preview while dictating: a glow that says Ukti is listening,
// a prompt before the first word, words that resolve in and settle, and a
// copy of each final sentence that flies into its box. Same size and place
// as before; nothing runs at idle; nothing moves under reduced motion.

const nodeTest = require('node:test');
const { before, after, beforeEach } = nodeTest;
const test = (name, fn) => nodeTest.test(name, { timeout: 60000 }, fn);
const assert = require('node:assert/strict');
const { serve, launch, storage, waitFor, command } = require('./helpers');
const { fakeSpeech, randomPort } = require('./speech');

let server, base, ext, off;
before(async () => {
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}`;
  const cdp = randomPort();
  ext = await launch({ args: [`--remote-debugging-port=${cdp}`] });
  off = await fakeSpeech(ext, cdp);
  await storage.set(ext.worker, { coachDone: true, uiLang: 'bn', theme: 'glass' });
});
after(async () => { off?.close(); await ext?.close().catch(() => {}); server?.close(); });
beforeEach(async () => { await off.eval('stopDictation(), true'); await storage.set(ext.worker, { uiLang: 'bn' }); });

const H = '[data-ukti="bar"]';
async function listening(reduced = false) {
  const page = await ext.context.newPage();
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${base}/textarea.html`);
  await page.waitForFunction(() => window.mimic);
  await page.evaluate(() => mimic.el.focus());
  await command(ext, page, 'toggle-dictation');
  assert.ok(await waitFor(() => off.eval('__fake.live().length === 1')), 'not listening');
  await page.waitForTimeout(300);
  return page;
}
const inPreview = (page, fn, arg) => page.evaluate(([h, src, a]) => {
  const root = document.querySelector(h).shadowRoot;
  return new Function('root', 'a', src)(root, a);
}, [H, `return (${fn.toString()})(root, a)`, arg]);

test('while listening, a glow ring turns around the preview', async () => {
  const page = await listening();
  try {
    const ring = await inPreview(page, root => {
      const p = root.querySelector('.preview');
      const cs = getComputedStyle(p, '::before');
      return { on: p.classList.contains('on'), anim: cs.animationName, bg: cs.backgroundImage.slice(0, 15) };
    });
    assert.equal(ring.on, true);
    assert.equal(ring.anim, 'glow-turn');
    assert.match(ring.bg, /conic-gradient/);
    // The angle must be a registered <angle>, or it jumps instead of turning.
    const angles = await inPreview(page, root => new Promise(done => {
      const p = root.querySelector('.preview'); const out = [];
      const read = () => parseFloat(getComputedStyle(p, '::before').getPropertyValue('--ukti-glow-angle'));
      out.push(read()); setTimeout(() => { out.push(read()); done(out); }, 200);
    }));
    assert.ok(angles.every(Number.isFinite) && angles[0] !== angles[1], `angle did not turn: ${angles}`);
  } finally { await page.close(); }
});

test('before the first word, the preview says it is listening; the first word replaces it', async () => {
  const page = await listening();
  try {
    const prompt = () => inPreview(page, root => {
      const h = root.querySelector('.preview .hint');
      return h && getComputedStyle(h).display !== 'none' ? h.textContent : null;
    });
    assert.equal(await prompt(), 'বলুন, শুনছি…');
    await off.eval('__fake.say("আমি", false)');
    assert.ok(await waitFor(async () => (await prompt()) === null), 'prompt stayed after the first word');
  } finally { await page.close(); }
});

test('the prompt is in English when the setting is English', async () => {
  await storage.set(ext.worker, { uiLang: 'en' });
  const page = await listening();
  try {
    const text = await inPreview(page, root => root.querySelector('.preview .hint')?.textContent);
    assert.equal(text, 'Speak, I am listening…');
  } finally { await page.close(); }
});

test('words being guessed shimmer; a final sentence settles in its own segment', async () => {
  const page = await listening();
  try {
    await off.eval('__fake.say("আমি ভালো", false)');
    await page.waitForTimeout(150);
    const live = await inPreview(page, root => getComputedStyle(root.querySelector('.preview .live w')).animationName);
    assert.match(live, /shimmer/, live);
    await off.eval('__fake.say("আমি ভালো আছি")');
    await page.waitForTimeout(80);
    const seg = await inPreview(page, root => {
      const s = root.querySelector('.preview .done .seg:last-child');
      return s && { text: s.textContent, anim: getComputedStyle(s).animationName };
    });
    assert.deepEqual(seg, { text: 'আমি ভালো আছি', anim: 'settle' });
  } finally { await page.close(); }
});

test('a final sentence flies into the box, and the flier is gone after', async () => {
  const page = await listening();
  try {
    const seen = inPreview(page, root => new Promise(done => {
      let max = 0, saw = null; const t0 = performance.now();
      (function tick() {
        const f = root.querySelector('.fly');
        if (f) { saw = f.textContent; max = Math.max(max, 1); }
        if (performance.now() - t0 < 1200) requestAnimationFrame(tick);
        else done({ saw, left: root.querySelectorAll('.fly').length });
      })();
    }));
    await off.eval('__fake.say("আমার কথা")');
    const r = await seen;
    assert.equal(r.saw, 'আমার কথা');
    assert.equal(r.left, 0);
  } finally { await page.close(); }
});

// The test browser's fake microphone plays a beep, so the real level keeps
// changing; the check is that the preview carries the same level as the
// microphone button, which it did not before.
test('the ring follows the voice: the level reaches the preview', async () => {
  const page = await listening();
  try {
    await off.eval("emit('LEVEL', { level: 0.8 }), true");
    assert.ok(await waitFor(() => inPreview(page, root => {
      const p = root.querySelector('.preview').style.getPropertyValue('--lvl');
      const m = root.querySelector('button.main')?.style.getPropertyValue('--lvl');
      return p !== '' && p === m;
    })), 'the preview never received the level');
  } finally { await page.close(); }
});

test('long dictation scrolls inside the preview, and the ring stays on its edge', async () => {
  const page = await listening();
  try {
    for (let i = 0; i < 14; i++) await off.eval(`__fake.say("এটা অনেক লম্বা একটা বাক্য যেটা প্রিভিউ ভরে দেবে ${i}")`);
    await page.waitForTimeout(400);
    const m = await inPreview(page, root => {
      const p = root.querySelector('.preview'), s = root.querySelector('.preview .scroll');
      return { scrolls: s.scrollHeight > s.clientHeight, atEnd: Math.abs(s.scrollTop + s.clientHeight - s.scrollHeight) < 4,
        frameScrolls: p.scrollHeight > p.clientHeight + 2 };
    });
    assert.ok(m.scrolls, 'the text area did not scroll');
    assert.ok(m.atEnd, 'not scrolled to the newest words');
    assert.equal(m.frameScrolls, false, 'the frame scrolls, so the ring would scroll away');
  } finally { await page.close(); }
});

test('reduced motion: the ring is still, words do not shimmer, nothing flies', async () => {
  const page = await listening(true);
  try {
    await off.eval('__fake.say("আমি", false)');
    await page.waitForTimeout(150);
    const r = await inPreview(page, root => {
      const p = root.querySelector('.preview');
      const w = root.querySelector('.preview .live w');
      return { ring: getComputedStyle(p, '::before').animationName, word: getComputedStyle(w).animationName,
        wordColor: getComputedStyle(w).color };
    });
    assert.equal(r.ring, 'none');
    assert.equal(r.word, 'none');
    assert.notEqual(r.wordColor, 'rgba(0, 0, 0, 0)', 'text is transparent without the shimmer');
    const flew = inPreview(page, root => new Promise(done => { let n = 0; const t0 = performance.now();
      (function tick() { n += root.querySelectorAll('.fly').length; if (performance.now() - t0 < 900) requestAnimationFrame(tick); else done(n); })(); }));
    await off.eval('__fake.say("আমি আছি")');
    assert.equal(await flew, 0);
  } finally { await page.close(); }
});

test('when dictation stops, the preview closes and keeps no words', async () => {
  const page = await listening();
  try {
    await off.eval('__fake.say("গোপন কথা")');
    await command(ext, page, 'toggle-dictation');
    await page.waitForTimeout(500);
    const r = await inPreview(page, root => ({ on: root.querySelector('.preview').classList.contains('on'),
      text: root.querySelector('.preview .scroll').textContent }));
    assert.equal(r.on, false);
    assert.equal(r.text.includes('গোপন'), false);
  } finally { await page.close(); }
});

test('a finished sentence and the next live words are kept apart by a space', async () => {
  const page = await listening();
  try {
    await off.eval('__fake.say("আমি যাবো")');
    await off.eval('__fake.say("তারপর", false)');
    await page.waitForTimeout(700);
    const gap = await inPreview(page, root => {
      const seg = root.querySelector('.preview .seg:last-child').getBoundingClientRect();
      const w = root.querySelector('.preview .live w').getBoundingClientRect();
      return Math.round(w.left - seg.right);
    });
    assert.ok(gap >= 3, `gap ${gap}px`);
  } finally { await page.close(); }
});
