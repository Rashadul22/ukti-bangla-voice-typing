#!/usr/bin/env node
// Counts the design values each style sheet uses, so drift shows: radii,
// font sizes, transition durations, and spacing. Usage: node tests/ui/tokens.js
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..');
const css = {
  popup: fs.readFileSync(path.join(ROOT, 'popup.html'), 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1],
  setup: fs.readFileSync(path.join(ROOT, 'setup.html'), 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1],
  control: (() => { const s = fs.readFileSync(path.join(ROOT, 'content.js'), 'utf8'); return s.slice(s.indexOf('const STYLE = `'), s.indexOf('`;', s.indexOf('const STYLE = `'))); })()
};
const count = (src, re, map = v => v) => {
  const m = new Map();
  for (const x of src.matchAll(re)) { const v = map(x[1].trim()); m.set(v, (m.get(v) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
for (const [name, src] of Object.entries(css)) {
  const vars = Object.fromEntries([...src.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
  const resolve = v => v.replace(/var\((--[\w-]+)\)/g, (_, k) => vars[k] || k);
  console.log(`\n== ${name}`);
  console.log('  radius:', count(src, /border-radius:\s*([^;]+);/g, resolve).map(([v, n]) => `${v}×${n}`).join('  '));
  console.log('  font-size:', count(src, /font-size:\s*([^;]+);/g).map(([v, n]) => `${v}×${n}`).join('  '));
  const durs = [];
  for (const m of src.matchAll(/transition(?:-duration)?:\s*([^;]+);/g)) for (const d of m[1].matchAll(/(\.\d+|\d+(?:\.\d+)?)m?s/g)) durs.push(d[0]);
  const dm = new Map(); for (const d of durs) dm.set(d, (dm.get(d) || 0) + 1);
  console.log('  durations:', [...dm.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v}×${n}`).join('  '));
  console.log('  gap:', count(src, /\bgap:\s*([^;]+);/g).map(([v, n]) => `${v}×${n}`).join('  '));
}
