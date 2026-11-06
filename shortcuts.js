// Ukti - the shortcut list on the popup and the setup page.
//
// The shortcuts are chrome.commands, so the user can change them, and the
// pages show what they are bound to now rather than a fixed list. Bengali
// text goes in first; i18n.js turns it into English when that is the setting.

const UNSET = 'সেট করা নাই';

function keyCaps(shortcut) {
  const box = document.createDocumentFragment();
  if (!shortcut) {
    const none = document.createElement('span');
    none.className = 'unset';
    none.textContent = UNSET;
    box.append(none);
    return box;
  }
  for (const part of shortcut.split('+')) {
    const kbd = document.createElement('kbd');
    kbd.textContent = part;
    box.append(kbd);
  }
  return box;
}

async function paintShortcuts() {
  let all = [];
  try { all = await chrome.commands.getAll(); } catch (_) {}
  const bound = Object.fromEntries(all.map(c => [c.name, c.shortcut || '']));
  for (const combo of document.querySelectorAll('.combo[data-command]')) {
    combo.replaceChildren(keyCaps(bound[combo.dataset.command]));
  }
  if (typeof applyLang === 'function') applyLang(document.body, uktiLang);
}

paintShortcuts();
// Back from chrome://extensions/shortcuts: show the new bindings.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') paintShortcuts();
});

document.getElementById('changeShortcuts')?.addEventListener('click', event => {
  event.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});
