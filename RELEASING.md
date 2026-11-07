# Releasing Ukti

Do these in order. `scripts/package.sh` checks the mechanical parts and
refuses to build if any is wrong; the rest is on you.

## 1. Bump the version, in both places

- `manifest.json`: `"version": "X.Y.Z"`
- `setup.html`: the footer, `<span class="ver">vX.Y.Z</span>`

The packager refuses to build when these differ.

## 2. If a stored default changed, migrate it

An unpacked extension keeps its id, so `chrome.storage` survives a remove
and reinstall, and an old saved value outranks a new default forever.

- Raise `SCHEMA` in `background.js`.
- In `migrate()`, set the keys whose defaults changed, for profiles below the
  new schema. Do not touch keys whose meaning did not change: those are the
  user's choices.
- Change the default in `getSettings()` (`background.js`), `DEFAULTS` in
  `popup.js` and `DEFAULTS` in `content.js` together. A test checks the popup
  and the worker agree.
- Add a case to `tests/release.test.js` modelled on "a schema 2 install gets
  the v3 defaults": install the previous version with the old value saved,
  upgrade, and assert the default moved while the other choices stayed.

## 3. Update CHANGELOG.md

Move the "Unreleased" items under the new version.

## 4. Run the tests

```
npm test
```

All must pass. The packager runs them again and refuses to build on a
failure. Optional, slower: `npm run test:mutants` checks the suite still
notices each known bug.

## 5. Build

```
sh scripts/package.sh
```

or, on Windows, `node scripts/package.js`. It checks the versions, that every
file the manifest and pages refer to exists, that each icon is a PNG of the
size it claims, runs the tests, builds `dist/ukti-X.Y.Z.zip` from only the
files the extension uses (plus `LICENSE`), and then loads the built zip as an
unpacked extension to confirm it starts and reports the right version.

## 6. Check the zip by hand

The packager's load check runs headless. Before uploading, also:

1. Unzip `dist/ukti-X.Y.Z.zip` into an empty folder.
2. In `chrome://extensions`, Developer mode on, **Load unpacked**, pick the
   folder. Check the version shown.
3. Open a page, click into a text box, dictate a sentence, press অ on some
   Banglish, press undo.
4. Open the popup in both languages.

**If you are testing an update over an existing unpacked install:** press
**Reload** on the extension card after replacing the files. Restarting Chrome
alone can keep running the old `background.js` from Chrome's cache while the
manifest already shows the new version; this was measured while writing the
upgrade test, and it is the kind of thing that makes a fix look as if it did
not work.

## 7. Publish the GitHub Release, with BOTH zips

The packager writes the same zip under two names:

- `dist/ukti-X.Y.Z.zip`: the numbered one, for people who want a specific
  version.
- `dist/ukti-latest.zip`: a fixed name. The website's download button links
  to `https://github.com/Rashadul22/ukti-bangla-voice-typing/releases/latest/download/ukti-latest.zip`,
  which GitHub turns into a one-click download of that file from the newest
  release. GitHub needs the exact file name in that URL, so the name must
  never change.

**Attach both files to every release.** If `ukti-latest.zip` is missing from
the newest release, the website's download button gives a 404 for everyone.

Pushing a version tag (`git tag vX.Y.Z && git push origin vX.Y.Z`) runs
`.github/workflows/release.yml`, which builds and attaches both. By hand: on
the release page, **Edit**, drag both files into the assets box, **Update
release**.

Then check, from a private window:

```
curl -sIL https://github.com/Rashadul22/ukti-bangla-voice-typing/releases/latest/download/ukti-latest.zip | grep -iE '^HTTP|content-length'
```

The last status must be 200 and the length the size of the new zip.

## 8. Chrome Web Store

Upload the zip to the Chrome Web Store dashboard. The listing text, privacy
policy and submission checklist are in `store/`.
