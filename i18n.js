// Ukti - the English face of the popup and the setup page.
//
// The on-page control already had both languages; these two pages did not,
// so anyone who prefers reading English had no way to. Rather than mark up
// every element with a key, the Bengali text in the HTML is the key: this
// file maps each phrase to its English twin and swaps the text nodes once,
// when the page opens, and again whenever the setting changes.

const UKTI_EN = {
  // ---- shared
  'উক্তি': 'Ukti',
  'শর্টকাট': 'Shortcuts',
  'বলা শুরু বা বন্ধ': 'Start or stop speaking',
  'বাংলিশ → বাংলা': 'Banglish to Bangla',
  'লেখাটা ইংরেজি': 'Make the text English',
  'ফেরত নিন': 'Undo',
  'শর্টকাট বদলান': 'Change shortcuts',
  'সব শব্দ, ফাইলে রাখা বা আনা': 'All words, save to or load from a file',
  'উক্তির শব্দ': "Ukti's words",
  'আপনার নিজের লেখা আর উক্তির মনে রাখা সব শব্দ, এখানেই।': 'Every word fix, the ones you wrote and the ones Ukti remembered, in one place.',
  'বদলালে নিজে থেকেই জমা হয়। মুছতে চাইলে লাইনটা মুছে দিন। সব আপনার কম্পিউটারেই থাকে, কোথাও পাঠানো হয় না।':
    'Changes are saved as you type. Delete a line to delete it. Everything stays on your computer and is sent nowhere.',
  'ফাইলে রাখুন': 'Save to a file',
  'ফাইল থেকে আনুন': 'Load from a file',
  'শব্দের তালিকা': 'The list of words',
  'কখন দেখাবে': 'When it shows',
  'স্মার্ট': 'Smart',
  'সব বক্সে': 'Every box',
  'বাছাই সাইটে': 'Chosen sites',
  'স্মার্ট: লেখার বক্সে আসে, সার্চ বক্সে আসে না যদি না বাংলিশ লেখেন, আর বক্স ছেড়ে গেলে লুকিয়ে যায়। বাছাই সাইটে: শুধু যেসব সাইটে ওপরের "এই সাইট" সুইচ চালু করবেন।':
    'Smart: appears in writing boxes, not in search boxes unless you type Banglish, '
    + 'and hides when you leave the box. Chosen sites: only on the sites where you '
    + 'turn on the "This site" switch above.',
  'সেট করা নাই': 'Not set',
  'বাংলা': 'Bangla',

  // ---- popup, header and site switch
  'সব জায়গায় চালু': 'On everywhere',
  'সব জায়গায় বন্ধ': 'Off everywhere',
  'সব জায়গায় চালু বা বন্ধ': 'Turn on or off everywhere',
  'এই সাইট': 'This site',
  'এই সাইটে চালু': 'On for this site',
  'এই সাইটে বন্ধ': 'Off for this site',
  'শুধু এই সাইটে চালু বা বন্ধ': 'Turn on or off for this site only',

  // ---- popup, tabs
  'প্রধান': 'Main',
  'চেহারা': 'Look',
  'শব্দ': 'Words',

  // ---- popup, main
  'আউটপুট': 'Output',
  'কথা যেভাবে বসবে': 'Speech goes in as',
  'লেখাগুলোর ভাষা': 'Language of these labels',
  'সেটআপ খুলুন': 'Open setup',

  // ---- popup, look
  'থিম': 'Theme',
  'স্বচ্ছ': 'Glass',
  'কালো': 'Dark',
  'সাদা': 'Light',
  'আকার': 'Size',
  'ছোট': 'Small',
  'মাঝারি': 'Medium',
  'বড়': 'Large',
  'সাজানো': 'Layout',
  'সব': 'All',
  'গুটিয়ে': 'Collapsed',
  'কোথায় বসবে': 'Where it sits',
  'নিজে থেকে': 'Automatic',
  'ডানে নিচে': 'Bottom right',
  'বাঁয়ে নিচে': 'Bottom left',
  'কোন বাটনগুলো থাকবে': 'Which buttons to show',
  'বাংলিশ → বাংলা (অ)': 'Banglish to Bangla (অ)',
  'ইংরেজি করা (EN)': 'Make English (EN)',
  'ফেরত নেওয়া': 'Undo',
  'সরানোর হাতল': 'Move handle',
  'বাটনের নাম সবসময় দেখাও': 'Always show button names',

  // ---- popup, words
  'নিজের শব্দ ঠিক করা': 'Fix your own words',
  'প্রতি লাইনে: যা শোনে = যা হবে': 'One per line: what it hears = what it becomes',
  'আচরণ': 'Behaviour',
  'বাড়তি শব্দ বাদ দাও': 'Drop filler words',
  'বলা শেষে পাঠিয়ে দাও': 'Send when I stop speaking',

  // ---- setup page
  'উক্তি সেটআপ': 'Ukti setup',
  'দুইটা ধাপ, একবারই করতে হবে।': 'Two steps, and only once.',
  'মাইক্রোফোন চালু করুন': 'Turn on the microphone',
  'বাংলা ভাষা প্যাক নামান': 'Download the Bangla language packs',
  'বাংলা → ইংরেজি': 'Bangla to English',
  'ইংরেজি → বাংলা': 'English to Bangla',
  'নামান': 'Download',
  'মনে রাখার মতো দুইটা কথা': 'Two things worth knowing',
  'খোলা পেজে কাজ করবে না': 'It will not work on pages already open',
  'অনেকক্ষণ বললে থেমে যেতে পারে': 'It can stop after a long stretch',
  'বাংলিশ লেখা বাংলা করুন': 'Turn typed Banglish into Bangla',
  'লেখাটা ইংরেজি করুন': 'Turn the text into English',
  'দুইটা ধাপ সবুজ হলে পেজটা বন্ধ করে দিন, উক্তি তৈরি':
    'Once both steps are green, close this page. Ukti is ready.',

  // ---- setup page, the longer paragraphs
  'বাংলায় বলার জন্য মাইক্রোফোনের অনুমতি দরকার। বাটনে চাপলে Chrome অনুমতি চাইবে,':
    'Speaking in Bangla needs microphone permission. Press the button and Chrome will ask;',
  'দিন।': 'allow it.',
  'অনুবাদের জন্য দুই দিকের প্যাক লাগে। একবার নামলে আর লাগবে না, আর অনুবাদ আপনার কম্পিউটারেই হবে।':
    'Translation needs a pack for each direction. Download them once and the '
    + 'translating happens on your own computer from then on.',
  'উক্তি ইনস্টল করার আগে যে ট্যাবগুলো খোলা ছিল, সেগুলোতে একবার F5 চেপে রিফ্রেশ করে নিন। এরপর থেকে সব পেজে এমনিতেই চলবে।':
    'Tabs that were already open before Ukti was installed need one press of '
    + 'F5 to refresh. Every page opened after that just works.',
  'এর ফ্রি ভয়েস সার্ভিসের সীমা আছে, তাই লম্বা কথার পর ওটা সাড়া দেওয়া বন্ধ করে দিতে পারে। মাইকে চেপে বন্ধ করে আবার চালু করলেই ঠিক হয়ে যায়। অনুচ্ছেদ ধরে বললে এটা কম হয়।':
    "'s free voice service has limits, so after a long stretch it can stop "
    + 'answering. Press the microphone to stop and start again and it comes '
    + 'back. Speaking a paragraph at a time makes it happen less.',
  '"নিজে থেকে" মানে যে বক্সে লিখছেন তার পাশে এসে বসবে। মাইকের বাটনটা ধরে টেনেও সরানো যায়, আর এখান থেকে আবার আগের জায়গায় ফেরানো যায়।':
    '"Automatic" means it comes and sits beside the box you are writing in. '
    + 'You can also drag it by the microphone button, and bring it back from here.',

  'কথা লেখায় বদলাতে Chrome আপনার কণ্ঠ Google এর সার্ভারে পাঠায়। উক্তি নিজে কোনো কথা জমা রাখে না, কোথাও পাঠায়ও না।':
    "To turn speech into text, Chrome sends your voice to Google's servers. "
    + 'Ukti itself saves none of what you say and sends nothing anywhere.',

  // ---- setup page, status messages
  'অনুমতি দেওয়া আছে।': 'Permission granted.',
  'অনুমতি চাওয়া হচ্ছে…': 'Asking for permission…',
  'হয়ে গেছে, মাইক্রোফোন চালু।': 'Done, the microphone is on.',
  'অনুমতি দেওয়া হয়নি। আবার চেষ্টা করুন, অথবা ঠিকানা বারের তালা আইকনে গিয়ে মাইক্রোফোন allow করুন।':
    'Permission was refused. Try again, or allow the microphone from the lock '
    + 'icon in the address bar.',
  'কোনো মাইক্রোফোন পাওয়া যায়নি।': 'No microphone was found.',
  'এই Chrome এ বিল্ট-ইন অনুবাদ নাই। Chrome 138 বা পরের ভার্সন দরকার।':
    'This Chrome has no built-in translation. Chrome 138 or newer is needed.',
  'এই জোড়াটা এখানে পাওয়া যাচ্ছে না।': 'This pair is not available here.',
  'নামানো আছে।': 'Downloaded.',
  'শুরু হচ্ছে…': 'Starting…',
  'নামছে… ': 'Downloading… ',
  'হয়ে গেছে। পরীক্ষা: “': 'Done. Test: “',
  'ডাউনলোড শুরু করতে বাটনে সরাসরি চাপ দিতে হবে। আবার চেষ্টা করুন।':
    'The download has to start from a direct press on the button. Try again.',

  'নিজে থেকে: যে বক্সে লিখছেন তার পাশে বসে। মাইক টেনেও সরানো যায়।':
    'On its own: it sits beside the box you are writing in. You can also drag the mic.',
  'স্মার্ট: লেখার বক্সে আসে, বক্স ছাড়লে লুকায়। বাছাই সাইটে: যেখানে "এই সাইট" চালু করবেন।':
    'Smart: appears in writing boxes and hides when you leave. Chosen sites: only where "This site" is on.',

  // ---- credit
  'বানিয়েছেন': 'Built by',
  'মোঃ রাশেদুল ইসলাম': 'Md Rashadul Islam',
  '· CSE, DIU': '· CSE, DIU',
  'বন্ধুকে জানান': 'Tell a friend',
  'মুখে বলা কমান্ড': 'Spoken commands',
  'প্রশ্নবোধক, নতুন লাইন, দাঁড়ি চিহ্ন। শুধু "দাঁড়ি", "কমা" বা "মুছে দাও" একা বললে।':
    'Say "proshnobodhok" (?), "notun line" or "dari chinho" (।) at the end. A bare "dari", "koma" or "muchhe dao" (undo) only when said alone.',
  'ইংরেজি শব্দ ইংরেজি হরফে': 'English words in English letters',
  'শুরু আর থামার শব্দ': 'A sound on start and stop',
  'লেখার ধরন': 'Writing',
  'সংখ্যা': 'Numbers',
  'যেমন বলা': 'As spoken',
  'উচ্চারণ': 'Accent',
  'বাংলাদেশ': 'Bangladesh',
  'পশ্চিমবঙ্গ': 'West Bengal',
  'স্নিপেট: একটা কথা বললে পুরো লেখা': 'Snippets: say a phrase, get a whole text',
  'স্নিপেট: যা বলবেন = যা বসবে': 'Snippets: what you say = what goes in',
  'স্নিপেটের তালিকা': 'The list of snippets',
  'আমার ঠিকানা = বাড়ি ১২, রোড ৩, ঢাকা': 'my address = House 12, Road 3, Dhaka',
  'শুধু বাম পাশের কথাটা একা বললে ডান পাশের লেখাটা বসবে। বাক্যের ভেতরে বললে কিছু হবে না।':
    'Say the left side on its own and the right side goes in. Said inside a sentence, nothing happens.',
  'কপি হয়েছে, এখন পেস্ট করুন': 'Copied, now paste it',
  'কপি করা গেল না': 'Could not copy',
  'উক্তি ভালো লাগছে?': 'Enjoying Ukti?',
  'স্টোরে একটা রেটিং দিলে আরো মানুষ উক্তি খুঁজে পাবে।': 'A rating on the store helps more people find it.',
  'রেটিং দিন': 'Rate it',
  'এখন না': 'Not now',
  'বলে দেখুন': 'Try it',
  'বোতামে চেপে বাংলায় কিছু বলুন, লেখাটা এখানেই উঠবে।': 'Press the button and say something in Bangla; it appears right here.',
  'যেমন: আমি আজকে খুব খুশি': 'For example, say: ami ajke khub khushi',
  'বলা শুরু করুন': 'Start speaking',
  'থামান': 'Stop',
  'শুনছি…': 'Listening…',
  'আগে ১ নম্বর ধাপে মাইক্রোফোন চালু করুন।': 'Turn on the microphone in step 1 first.',
  'শুরু করা গেল না।': 'Could not start.',
  '৩': '3',
  'নির্মাতা': 'The maker',
  'কম্পিউটার সায়েন্স (CSE) শিক্ষার্থী, ড্যাফোডিল ইন্টারন্যাশনাল ইউনিভার্সিটি':
    'Computer Science (CSE) student, Daffodil International University',
  'যারা বাংলা টাইপ করতে পারেন না, তারাও যেন নিজের ভাষায় সহজে লিখতে পারেন, সেজন্যই উক্তি। একদম ফ্রি, আর আপনার কথা কোথাও জমা থাকে না।':
    'Ukti is for everyone who cannot type Bangla, so they can still write in their own language with ease. Completely free, and nothing you say is kept anywhere.',
  'LinkedIn এ যোগাযোগ': 'Contact on LinkedIn',
  'রাসেদুল = রাশেদুল': 'রাসেদুল = রাশেদুল',

  // ---- setup, step numbers shown in the badges
  '১': '1',
  '২': '2',
  '৮': '8',

  // ---- setup, the longer paragraphs
  'বাংলায় বলার জন্য মাইক্রোফোনের অনুমতি দরকার। বাটনে চাপলে Chrome অনুমতি চাইবে, "Allow" দিন।':
    'Speaking in Bangla needs microphone permission. Press the button and Chrome will ask; choose "Allow".',
  'Google এর ফ্রি ভয়েস সার্ভিসের সীমা আছে, তাই লম্বা কথার পর ওটা সাড়া দেওয়া বন্ধ করে দিতে পারে। মাইকে চেপে বন্ধ করে আবার চালু করলেই ঠিক হয়ে যায়। অনুচ্ছেদ ধরে বললে এটা কম হয়।':
    "Google's free voice service has a limit, so after a long stretch of speech it can stop responding. Press the mic to stop and start again and it clears. Speaking a paragraph at a time makes it rarer."
};

// Collapsing runs of whitespace lets a phrase written across several lines
// in the HTML still match its single-line key here.
const squash = v => v.replace(/\s+/g, ' ').trim();

const UKTI_EN_SQUASHED = (() => {
  const out = Object.create(null);
  for (const [bn, en] of Object.entries(UKTI_EN)) out[squash(bn)] = en;
  return out;
})();

function tr(text, lang) {
  if (lang !== 'en' || text == null) return text;
  const hit = UKTI_EN_SQUASHED[squash(text)];
  return hit == null ? text : hit;
}

// Keep the original Bengali on the node, so switching back costs nothing
// and a second pass cannot translate an already translated string.
function applyLang(root, lang) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    if (!node.nodeValue || !node.nodeValue.trim()) continue;
    if (node.parentElement && node.parentElement.closest('script, style')) continue;

    if (node.__bn == null) node.__bn = node.nodeValue;
    const original = node.__bn;
    // The lookup ignores surrounding whitespace, but the page needs it: a
    // phrase followed by a link lost its space ("Built byMd Rashadul Islam").
    const lead = original.match(/^\s*/)[0], trail = original.match(/\s*$/)[0];
    const next = lang === 'en' ? lead + tr(original.trim(), 'en') + trail : original;
    if (node.nodeValue !== next) node.nodeValue = next;
  }

  for (const el of root.querySelectorAll('[title], [placeholder], [aria-label]')) {
    for (const attr of ['title', 'placeholder', 'aria-label']) {
      if (!el.hasAttribute(attr)) continue;
      const key = '__bn_' + attr;
      if (el[key] == null) el[key] = el.getAttribute(attr);
      el.setAttribute(attr, lang === 'en' ? tr(el[key], 'en') : el[key]);
    }
  }

  // The tab title is what a screen reader announces for the page, and it
  // stayed Bengali in English mode.
  if (document.__bnTitle == null) document.__bnTitle = document.title;
  document.title = lang === 'en' ? tr(document.__bnTitle, 'en') : document.__bnTitle;

  document.documentElement.lang = lang === 'en' ? 'en' : 'bn';
}

let uktiLang = 'bn';

// The Chrome Web Store page, once Ukti is published. Until then it stays
// empty: the share message says to search the store instead, and the
// rating request in the popup never appears (there is nowhere to send
// people). Fill this in, and nothing else needs to change.
self.UKTI_STORE_URL = self.UKTI_STORE_URL || '';

// "Tell a friend": a short message for the clipboard, in the page's
// language. Nothing is sent anywhere; the user pastes it where they like.
function uktiShareText() {
  const where = self.UKTI_STORE_URL ||
    (uktiLang === 'en' ? 'Search "Ukti" on the Chrome Web Store.' : 'Chrome Web Store-এ "Ukti" লিখে খুঁজুন।');
  return (uktiLang === 'en'
    ? 'With Ukti you just speak Bangla and it is written into any box on any site, no Bangla typing needed. Free, and nothing you say is kept. '
    : 'উক্তি দিয়ে বাংলায় বললেই যেকোনো সাইটের বক্সে বাংলা লেখা হয়ে যায়, বাংলা টাইপ জানা লাগে না। একদম ফ্রি, আর কথা কোথাও জমা থাকে না। ') + where;
}

function wireShare(button) {
  if (!button) return;
  const label = 'বন্ধুকে জানান', done = 'কপি হয়েছে, এখন পেস্ট করুন';
  let timer = null;
  button.addEventListener('click', async event => {
    event.preventDefault();
    try {
      await navigator.clipboard.writeText(uktiShareText());
      button.textContent = tr(done, uktiLang);
    } catch (_) {
      button.textContent = tr('কপি করা গেল না', uktiLang);
    }
    clearTimeout(timer);
    timer = setTimeout(() => { button.textContent = tr(label, uktiLang); }, 2500);
  });
}

chrome.storage.local.get({ uiLang: 'bn' }).then(({ uiLang }) => {
  uktiLang = uiLang === 'en' ? 'en' : 'bn';
  applyLang(document.body, uktiLang);
});

chrome.storage.onChanged.addListener(changes => {
  if (!changes.uiLang) return;
  uktiLang = changes.uiLang.newValue === 'en' ? 'en' : 'bn';
  applyLang(document.body, uktiLang);
});
