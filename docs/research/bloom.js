// Replace the exact Set with a 1% Bloom filter and rescore.
const fs=require('fs');
const words=fs.readFileSync(process.argv[2],'utf8').split('\n').map(s=>s.trim().normalize('NFC')).filter(Boolean);
const n=words.length,p=+process.argv[3]||0.01,m=Math.ceil(-n*Math.log(p)/Math.LN2**2),k=Math.round(m/n*Math.LN2);
const bits=new Uint8Array(Math.ceil(m/8));
function h(s,seed){let x=2166136261^seed;for(let i=0;i<s.length;i++){x^=s.charCodeAt(i);x=Math.imul(x,16777619);}return x>>>0;}
const pos=s=>{const a=h(s,0),b=(h(s,0x9e3779b9)|1)>>>0;const o=[];for(let i=0;i<k;i++)o.push((a+i*b)%m);return o;};
for(const w of words)for(const q of pos(w))bits[q>>3]|=1<<(q&7);
global.BLOOM={has:s=>pos(s).every(q=>bits[q>>3]&(1<<(q&7)))};
console.log(`bloom p=${p}: ${(bits.length/1024).toFixed(0)} KB, k=${k}`);
