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

  // ---- credit
  'বানিয়েছেন': 'Built by',
  'মোঃ রাশাদুল ইসলাম': 'Md Rashadul Islam',

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
    const next = lang === 'en' ? tr(original, 'en') : original;
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

  document.documentElement.lang = lang === 'en' ? 'en' : 'bn';
}

let uktiLang = 'bn';

chrome.storage.local.get({ uiLang: 'bn' }).then(({ uiLang }) => {
  uktiLang = uiLang === 'en' ? 'en' : 'bn';
  applyLang(document.body, uktiLang);
});

chrome.storage.onChanged.addListener(changes => {
  if (!changes.uiLang) return;
  uktiLang = changes.uiLang.newValue === 'en' ? 'en' : 'bn';
  applyLang(document.body, uktiLang);
});
