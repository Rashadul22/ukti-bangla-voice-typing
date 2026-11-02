// Shared helpers for the mimic editors. Each page sets window.mimic to
// { el, kind, model(), setText(s) } so a test can read what the editor
// itself believes it holds, which is not always what the DOM shows.

window.offsetsIn = function offsetsIn(el, range) {
  const at = (node, offset) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.setEnd(node, offset);
    return r.toString().length;
  };
  return [at(range.startContainer, range.startOffset), at(range.endContainer, range.endOffset)];
};

window.liveOffsets = function liveOffsets(el, fallback) {
  const s = getSelection();
  if (!s.rangeCount) return [fallback, fallback];
  const r = s.getRangeAt(0);
  if (!el.contains(r.commonAncestorContainer)) return [fallback, fallback];
  return offsetsIn(el, r);
};

window.placeCaret = function placeCaret(el, start, end = start) {
  const node = el.firstChild;
  const s = getSelection();
  const r = document.createRange();
  if (!node) { r.selectNodeContents(el); r.collapse(true); }
  else {
    const len = node.textContent.length;
    r.setStart(node, Math.min(start, len));
    r.setEnd(node, Math.min(end, len));
  }
  s.removeAllRanges();
  s.addRange(r);
};

// Typed keys arrive as trusted beforeinput events. Model-owning editors
// apply those to their model themselves, the way Lexical and Quill do.
window.applyTyping = function applyTyping(e, model, sel) {
  let [s, en] = sel;
  switch (e.inputType) {
    case 'insertText':
    case 'insertReplacementText':
      return { model: model.slice(0, s) + (e.data || '') + model.slice(en), caret: s + (e.data || '').length };
    case 'deleteContentBackward':
      if (s === en && s > 0) s -= 1;
      return { model: model.slice(0, s) + model.slice(en), caret: s };
    case 'deleteContentForward':
      if (s === en) en += 1;
      return { model: model.slice(0, s) + model.slice(en), caret: s };
    default:
      return null;
  }
};
