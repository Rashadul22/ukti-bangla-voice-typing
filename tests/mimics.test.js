// The mimic editors are only worth testing against if they really have the
// quirk they claim. These checks run with no extension involvement: each
// one performs the edit that the archetype is known to throw away, and
// confirms it is thrown away.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch } = require('./helpers');

let server, ext, base;
before(async () => {
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}`;
  ext = await launch();
});
after(async () => { await ext?.close(); server?.close(); });

async function run(kind, fn) {
  const page = await ext.context.newPage();
  await page.goto(`${base}/${kind}.html`);
  await page.waitForFunction(() => window.mimic);
  try { return await page.evaluate(fn); } finally { await page.close(); }
}

const later = ms => `new Promise(r => setTimeout(r, ${ms}))`;

test('model-paste: execCommand is reverted, a synthetic paste is kept', async () => {
  const out = await run('model-paste', async () => {
    mimic.setText('abc');
    document.execCommand('selectAll');
    document.execCommand('insertText', false, 'XYZ');
    const right = mimic.el.textContent;
    await new Promise(r => setTimeout(r, 50));
    const cmd = mimic.el.textContent;
    document.execCommand('selectAll');
    const dt = new DataTransfer(); dt.setData('text/plain', 'PASTED');
    mimic.el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 50));
    return { right, cmd, paste: mimic.el.textContent, model: mimic.model() };
  });
  assert.deepEqual(out, { right: 'XYZ', cmd: 'abc', paste: 'PASTED', model: 'PASTED' });
});

test('late-selection: a paste in the same task as select-all lands at the old caret', async () => {
  const out = await run('late-selection', async () => {
    mimic.setText('abc');
    await new Promise(r => setTimeout(r, 20));
    const paste = () => {
      const dt = new DataTransfer(); dt.setData('text/plain', 'X');
      mimic.el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    };
    document.execCommand('selectAll');
    paste();                                   // same task: stale caret
    const sameTask = mimic.model();
    await new Promise(r => setTimeout(r, 20));
    document.execCommand('selectAll');
    await new Promise(r => setTimeout(r, 20));
    paste();                                   // after a turn: whole box
    return { sameTask, later: mimic.model() };
  });
  assert.deepEqual(out, { sameTask: 'abcX', later: 'X' });
});

test('quill: a synthetic paste lands, then is rewritten; execCommand is kept', async () => {
  const out = await run('quill', async () => {
    mimic.setText('abc');
    document.execCommand('selectAll');
    const dt = new DataTransfer(); dt.setData('text/plain', 'PASTED');
    mimic.el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    const atOnce = mimic.el.textContent;
    await new Promise(r => setTimeout(r, 50));
    const afterTurn = mimic.el.textContent;
    document.execCommand('selectAll');
    document.execCommand('insertText', false, 'CMD');
    await new Promise(r => setTimeout(r, 50));
    return { atOnce, afterTurn, cmd: mimic.el.textContent, model: mimic.model() };
  });
  assert.deepEqual(out, { atOnce: 'PASTED', afterTurn: 'abc', cmd: 'CMD', model: 'CMD' });
});

test('caret-restore: focusing collapses a selection made straight after', async () => {
  const out = await run('caret-restore', async () => {
    mimic.setText('abcdef');
    window.placeCaret(mimic.el, 2);
    await new Promise(r => setTimeout(r, 20));
    document.getElementById('elsewhere').focus();
    mimic.el.focus();
    document.execCommand('selectAll');
    const right = getSelection().toString();
    await new Promise(r => setTimeout(r, 20));
    return { right, later: getSelection().toString() };
  });
  assert.deepEqual(out, { right: 'abcdef', later: '' });
});
