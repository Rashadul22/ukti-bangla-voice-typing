// Ukti - setup page.
// This must be a real tab. Chrome does not reliably show the microphone
// prompt from a popup or an offscreen document, and the Translator language
// pack will not download without user activation.

const micButton = document.getElementById('mic');
const micStatus = document.getElementById('micStatus');
const micStep = document.getElementById('micStep');

const packStep = document.getElementById('packStep');

function setStatus(node, text, kind) {
  node.className = 'status show' + (kind ? ' ' + kind : '');
  node.innerHTML = '';
  if (kind === 'ok') {
    const tick = document.createElement('div');
    tick.className = 'tick';
    node.appendChild(tick);
  }
  node.appendChild(document.createTextNode(text));
}

function markDone(step) {
  step.classList.add('done');
}

// ------------------------------------------------------------- microphone

async function micState() {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' });
    return result.state;
  } catch (_) {
    return 'unknown';
  }
}

micState().then(state => {
  if (state === 'granted') {
    setStatus(micStatus, tr('অনুমতি দেওয়া আছে।', uktiLang), 'ok');
    micButton.disabled = true;
    markDone(micStep);
  }
});

micButton.addEventListener('click', async () => {
  micButton.disabled = true;
  setStatus(micStatus, tr('অনুমতি চাওয়া হচ্ছে…', uktiLang));

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // The permission is what matters, not the stream. Release it at once so
    // the microphone indicator does not stay lit.
    stream.getTracks().forEach(track => track.stop());

    await chrome.storage.local.set({ micGranted: true });
    setStatus(micStatus, tr('হয়ে গেছে, মাইক্রোফোন চালু।', uktiLang), 'ok');
    markDone(micStep);
  } catch (error) {
    micButton.disabled = false;
    const message =
      error.name === 'NotAllowedError'
        ? tr('অনুমতি দেওয়া হয়নি। আবার চেষ্টা করুন, অথবা ঠিকানা বারের তালা আইকনে গিয়ে মাইক্রোফোন allow করুন।', uktiLang)
        : error.name === 'NotFoundError'
          ? tr('কোনো মাইক্রোফোন পাওয়া যায়নি।', uktiLang)
          : error.name + ': ' + error.message;
    setStatus(micStatus, message, 'bad');
  }
});

// ---------------------------------------------------------- language packs
// Each direction is its own model, and each download needs its own user
// click, because transient activation does not survive the first await.

const PACKS = [
  { from: 'bn', to: 'en', button: 'packBnEn', bar: 'barBnEn', status: 'stBnEn',
    sample: 'আমি বাংলায় কথা বলি' },
  { from: 'en', to: 'bn', button: 'packEnBn', bar: 'barEnBn', status: 'stEnBn',
    sample: 'I speak Bangla every day' }
];

const packDone = new Set();

function checkAllPacks() {
  if (packDone.size === PACKS.length) markDone(packStep);
}

for (const pack of PACKS) {
  const button = document.getElementById(pack.button);
  const status = document.getElementById(pack.status);
  const bar = document.getElementById(pack.bar);
  const fill = bar.querySelector('i');
  const pair = { sourceLanguage: pack.from, targetLanguage: pack.to };

  (async () => {
    if (!('Translator' in self)) {
      setStatus(status, tr('এই Chrome এ বিল্ট-ইন অনুবাদ নাই। Chrome 138 বা পরের ভার্সন দরকার।', uktiLang), 'bad');
      button.disabled = true;
      return;
    }
    let state;
    try { state = await Translator.availability(pair); } catch (_) { state = 'unknown'; }

    if (state === 'unavailable') {
      setStatus(status, tr('এই জোড়াটা এখানে পাওয়া যাচ্ছে না।', uktiLang), 'bad');
      button.disabled = true;
    } else if (state === 'available') {
      setStatus(status, tr('নামানো আছে।', uktiLang), 'ok');
      button.disabled = true;
      packDone.add(pack.button);
      checkAllPacks();
    }
  })();

  button.addEventListener('click', async () => {
    button.disabled = true;
    setStatus(status, tr('শুরু হচ্ছে…', uktiLang));
    bar.classList.add('show');

    try {
      // Straight from the click handler: nothing slow may run before this.
      const translator = await Translator.create({
        ...pair,
        monitor(m) {
          m.addEventListener('downloadprogress', event => {
            const percent = Math.round(event.loaded * 100);
            fill.style.width = percent + '%';
            setStatus(status, tr('নামছে… ', uktiLang) + percent + '%');
          });
        }
      });

      const out = await translator.translate(pack.sample);
      fill.style.width = '100%';
      setStatus(status, tr('হয়ে গেছে। পরীক্ষা: \u201C', uktiLang) + out + '\u201D', 'ok');
      setTimeout(() => bar.classList.remove('show'), 900);
      packDone.add(pack.button);
      checkAllPacks();
      await chrome.storage.local.set({ setupDone: true });
    } catch (error) {
      button.disabled = false;
      bar.classList.remove('show');
      setStatus(
        status,
        error.name === 'NotAllowedError'
          ? tr('ডাউনলোড শুরু করতে বাটনে সরাসরি চাপ দিতে হবে। আবার চেষ্টা করুন।', uktiLang)
          : error.name + ': ' + error.message,
        'bad'
      );
    }
  });
}
