const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = source.indexOf("  function handleKeyboardShortcut(event)");
const end = source.indexOf("  document.addEventListener(\"keydown\", handleKeyboardShortcut);", start);
assert.ok(start >= 0 && end > start);
assert.match(source, /action: "page-break", icon: "↧ Page break", title: "Insert page break \(Ctrl\+Enter or Command\+Enter\)", shortcut: "Control\+Enter Meta\+Enter"/);
assert.match(source, /if \(tool\.shortcut\) control\.setAttribute\("aria-keyshortcuts", tool\.shortcut\)/);

const selectedText = {};
const editor = { contains: (node) => node === selectedText };
const selection = { rangeCount: 1, anchorNode: selectedText };
const actions = [];
const api = new Function("window", "document", "editor", "$", "runTool", "saveDocument", "notify", "openFindDialog", "setMobileMenu", source.slice(start, end) + "\nreturn handleKeyboardShortcut;")(
  { getSelection: () => selection },
  { activeElement: null },
  editor,
  () => ({ classList: { contains: () => false } }),
  (action) => actions.push(action),
  () => {},
  () => {},
  () => {},
  () => {}
);

const press = (overrides = {}) => {
  let prevented = false;
  api({ key: "Enter", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, preventDefault: () => { prevented = true; }, ...overrides });
  return prevented;
};

assert.equal(press(), true, "Ctrl+Enter is handled for a selection inside the editor");
assert.deepEqual(actions, ["page-break"]);
assert.equal(press({ ctrlKey: false, metaKey: true }), true, "Command+Enter is handled on macOS");
assert.deepEqual(actions, ["page-break", "page-break"]);
assert.equal(press({ shiftKey: true }), false, "Ctrl+Shift+Enter is left alone");
selection.anchorNode = {};
assert.equal(press(), false, "the shortcut does not act on a selection outside the editor");
console.log("Document keyboard shortcuts checks passed");
