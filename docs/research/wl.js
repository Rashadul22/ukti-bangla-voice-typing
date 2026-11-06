const fs=require('fs'),path=require('path');
const R='/home/user/ukti-bangla-voice-typing/tests/corpus/';
const {engine}=(()=>{const vm=require('vm');return{engine(){const s={self:{}};vm.runInNewContext(fs.readFileSync('/home/user/ukti-bangla-voice-typing/banglish.js','utf8'),s);return s.self.UktiBanglish;}}})();
const B=engine();
const W=new Set(fs.readFileSync(process.argv[2] /* path to words.txt from github.com/tahmid02016/bangla-wordlist */,'utf8').split(/\r?\n/).map(s=>s.trim().normalize('NFC')).filter(Boolean));
const lines=f=>fs.readFileSync(R+f,'utf8').split('\n').map(l=>l.trimEnd()).filter(l=>l&&!l.startsWith('#'));
const pairs=f=>lines(f).map(l=>{const[i,w]=l.split('\t');return{input:i,want:w.split(' ').map(x=>x.split('|'))}});
const SW=[['ি','ী'],['ী','ি'],['ু','ূ'],['ূ','ু'],['স','শ'],['শ','স'],['স','ষ'],['শ','ষ'],['ষ','শ'],['ন','ণ'],['ণ','ন'],['জ','য'],['য','জ'],['দ','ড'],['র','ড়'],['ড়','র'],['ত','ৎ'],['ই','ঈ'],['উ','ঊ'],['ো',''],['য়','ই'],['ই','য়'],['া','্যা'],['ে','্যা'],['ং','ঙ'],['ঙ','ং'],['ত','ট'],['ট','ত'],['ড','দ'],['থ','ঠ'],['ধ','ঢ'],['ঞ','ন'],['ক্ষ','খ'],['খ','ক্ষ'],['জ্ঞ','গ্য'],['ো','']];
function cands(w,depth=2){let cur=new Set([w]),all=new Set([w]);for(let d=0;d<depth;d++){const next=new Set();for(const x of cur)for(const[a,b]of SW){let i=x.indexOf(a);while(i>=0){const y=x.slice(0,i)+b+x.slice(i+a.length);if(!all.has(y)){all.add(y);next.add(y);}i=x.indexOf(a,i+1);}}cur=next;}return[...all];}
function fix(word0){const word=word0.normalize('NFC');if(W.has(word)||!/[ঀ-৿]/.test(word))return word;for(const c of cands(word,1))if(W.has(c))return c;for(const c of cands(word,2))if(W.has(c))return c;return word;}
function score(f,useFix){let pass=0,n=0;for(const{input,want}of pairs(f)){n++;let got=B.convert(input).split(' ');if(useFix)got=got.map(fix);got=got.map(x=>x.normalize('NFC'));const wantN=want.map(a=>a.map(x=>x.normalize('NFC')));if(got.length===wantN.length&&got.every((w,i)=>wantN[i].includes(w)))pass++;}return `${pass}/${n} ${(100*pass/n).toFixed(1)}%`;}
for(const f of ['words.tsv','sentences.tsv','heldout-words.tsv','heldout-sentences.tsv'])console.log(f.padEnd(22),'now',score(f,false).padEnd(14),'with list',score(f,true));
// how many held-out wants are in the list at all
let inl=0,t=0;for(const{want}of pairs('heldout-words.tsv')){t++;if(want[0].some(x=>W.has(x.normalize('NFC'))))inl++;}console.log('held-out answers present in list:',inl,'/',t,' list size',W.size);
const bad=[];for(const{input,want}of pairs('words.tsv')){const g=B.convert(input).normalize('NFC');const f=g.split(' ').map(fix).join(' ');const w0=want[0].map(x=>x.normalize('NFC'));if(w0.includes(g)&&!w0.includes(f))bad.push(`${input}: ${g} -> ${f}`);}console.log('dev broken by list:',bad.length);console.log(bad.slice(0,15).join('\n'));
const good=[];for(const{input,want}of pairs('heldout-words.tsv')){const g=B.convert(input).normalize('NFC');const f=fix(g);const w0=want[0].map(x=>x.normalize('NFC'));if(!w0.includes(g)&&w0.includes(f))good.push(`${input}: ${g} -> ${f}`);}console.log('held-out fixed:',good.length);console.log(good.join('\n'));
