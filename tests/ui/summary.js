#!/usr/bin/env node
// Summarises docs/ui-audit/<phase>/report.json: each distinct finding once,
// with the worst value seen and how many surfaces show it.
const fs = require('node:fs');
const path = require('node:path');
const phase = process.argv[2] || 'before';
const r = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'ui-audit', phase, 'report.json'), 'utf8'));
const group = (key, pick, keep = () => true) => {
  const m = new Map();
  for (const [surface, a] of Object.entries(r)) {
    if (surface === 'motion') continue;
    for (const x of a[key] || []) {
      if (!keep(x)) continue;
      const k = pick(x);
      const e = m.get(k) || { n: 0, surfaces: [], worst: x };
      e.n++; e.surfaces.push(surface);
      if (key === 'contrast' && x.ratio < e.worst.ratio) e.worst = x;
      m.set(k, e);
    }
  }
  return [...m.entries()];
};
const area = s => s.replace(/-(bn|en)-(dark|light)$/, '').replace(/-on-(dark|light)$/, '');
console.log('== CONTRAST FAILURES (worst ratio / needed, surfaces)');
for (const [k, e] of group('contrast', x => x.what.replace(/".*"/, '') + ' ' + x.kind, x => !x.pass).sort((a, b) => a[1].worst.ratio - b[1].worst.ratio)) {
  console.log(`  ${e.worst.ratio.toFixed(2)} / ${e.worst.need}  ${k.trim()}  "${e.worst.what.match(/"(.*)"/)?.[1] || ''}"  fg ${e.worst.fg} bg ${e.worst.bg}  [${e.n}: ${[...new Set(e.surfaces.map(area))].slice(0, 4).join(', ')}]`);
}
console.log('== SMALL TARGETS (<40px hit area)');
for (const [k, e] of group('small', x => x.what)) console.log(`  ${k}  hit ${e.worst.hit}  "${e.worst.what.match(/"(.*)"/)?.[1] || ''}"  [${e.n}: ${[...new Set(e.surfaces.map(area))].slice(0, 3).join(', ')}]`);
console.log('== CLIPPED');
for (const [k, e] of group('clipped', x => x.what)) console.log(`  ${k}  scroll ${e.worst.scroll} client ${e.worst.client}  [${e.n}: ${[...new Set(e.surfaces)].slice(0, 4).join(', ')}]`);
console.log('== PAST THE WINDOW EDGE');
for (const [k, e] of group('offscreen', x => x.what)) console.log(`  ${k}  ${e.worst.left}..${e.worst.right} of ${e.worst.width}  [${e.n}: ${[...new Set(e.surfaces)].slice(0, 4).join(', ')}]`);
console.log('== OVERLAPS');
for (const [k, e] of group('overlaps', x => x.a + ' <> ' + x.b)) console.log(`  ${k}  ${e.worst.overlap}  [${e.n}]`);
console.log('== SCROLL');
for (const [s, a] of Object.entries(r)) if (a.scroll && (a.scroll.horizontal || a.scroll.vertical || a.scroll.contentHeight > a.scroll.viewport[1])) console.log(`  ${s}: h=${a.scroll.horizontal} v=${a.scroll.vertical} overflow=${a.scroll.bodyOverflow} content ${a.scroll.contentHeight} in ${a.scroll.viewport}`);
console.log('== FOCUS RING MISSING');
const fm = new Map();
for (const [s, a] of Object.entries(r)) for (const f of a.focus || []) if (!f.ring) { const k = f.tag + ' ' + f.id; const e = fm.get(k) || { n: 0, f, s: [] }; e.n++; e.s.push(area(s)); fm.set(k, e); }
for (const [k, e] of fm) console.log(`  ${k}  (${e.f.outline})  [${e.n}: ${[...new Set(e.s)].slice(0, 3).join(', ')}]`);
console.log('== MOTION UNDER prefers-reduced-motion');
for (const [s, list] of Object.entries(r.motion || {})) console.log(`  ${s}: ${list.length}${list.length ? ' e.g. ' + list.slice(0, 4).join('; ') : ''}`);
