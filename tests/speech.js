// Drives the real offscreen document with a fake speech recogniser. The
// offscreen page is not exposed by Playwright, so it is reached over raw
// CDP. Only webkitSpeechRecognition.prototype is replaced; offscreen.js,
// the service worker and the content script all run unmodified.

const FAKE = `(() => {
  if (window.__fake) return 'already';
  const fake = window.__fake = { instances: [], starts: 0, stops: 0, aborts: 0 };
  const P = webkitSpeechRecognition.prototype;
  const later = fn => setTimeout(fn, 15);
  P.start = function () {
    fake.starts++;
    fake.instances.push(this);
    this.__live = true;
    this.__results = [];
    later(() => this.__live && this.onstart && this.onstart());
  };
  const end = function () {
    if (!this.__live) return;
    this.__live = false;
    later(() => this.onend && this.onend());
  };
  P.stop = function () { fake.stops++; end.call(this); };
  P.abort = function () { fake.aborts++; end.call(this); };
  fake.live = () => fake.instances.filter(r => r.__live);
  fake.say = (text, final = true) => {
    const r = fake.live().at(-1);
    if (!r) return false;
    const last = r.__results.at(-1);
    if (last && !last.isFinal) r.__results.pop();
    const item = [{ transcript: text, confidence: 0.9 }];
    item.isFinal = final;
    r.__results.push(item);
    r.onresult && r.onresult({ resultIndex: r.__results.length - 1, results: r.__results });
    return true;
  };
  // The service ends a session on its own, as it does after a pause.
  fake.drop = () => { const r = fake.live().at(-1); if (r) end.call(r); };
  return 'installed';
})()`;

async function connect(port, match) {
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const t = list.find(x => x.url.endsWith(match));
    if (t) {
      const ws = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      let id = 0;
      const waiting = new Map();
      ws.onmessage = e => {
        const msg = JSON.parse(e.data);
        if (waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
      };
      return {
        target: t,
        async eval(expression) {
          const n = ++id;
          const reply = new Promise(r => waiting.set(n, r));
          ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate',
            params: { expression, returnByValue: true, awaitPromise: true } }));
          const msg = await reply;
          if (msg.result?.exceptionDetails) throw new Error(JSON.stringify(msg.result.exceptionDetails));
          return msg.result?.result?.value;
        },
        close() { try { ws.close(); } catch (_) {} }
      };
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`no target ending in ${match}`);
}

// Makes sure the offscreen document exists and has the fake installed.
async function fakeSpeech(ext, port) {
  await ext.worker.evaluate(() => ensureOffscreenDocument());
  const off = await connect(port, '/offscreen.html');
  await off.eval(FAKE);
  return off;
}

const randomPort = () => 9300 + Math.floor(Math.random() * 600);

module.exports = { fakeSpeech, connect, randomPort };
