const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");

assert.match(html, /id="open-document-tabs" hidden/);
assert.match(html, /id="open-document-tab-list" role="toolbar" aria-label="Open documents"/);
assert.match(html, /id="new-document-tab"[^>]*aria-label="Create a new document"/);
assert.match(source, /function renderOpenDocumentTabs\(\)/);
assert.match(source, /function markActiveDocumentTabDirty\(\)/);
assert.match(source, /item\.dirty \? `\$\{item\.title\} · Unsaved changes` : item\.title/);
assert.match(source, /item\.dirty \? `\$\{item\.title\}, unsaved changes` : item\.title/);
assert.match(source, /savedTab\.revision === tabRevision\) \{ savedTab\.dirty = false/);
assert.match(source, /open-document-tab-item\$\{item\.id === activeId && item\.kind === activeDocumentKind \? " active" : ""\}/);
assert.doesNotMatch(source, /wrapper\.setAttribute\("aria-selected"/);
assert.match(source, /tab\.setAttribute\("aria-pressed", String\(item\.id === activeId && item\.kind === activeDocumentKind\)\)/);
assert.match(source, /tab\.tabIndex = item\.id === activeId && item\.kind === activeDocumentKind \? 0 : -1/);
assert.match(source, /close\.setAttribute\("aria-label", `Close \$\{item\.title\}`\)/);
assert.match(source, /if \(!alreadyFlushed && !\(await flushActiveDocument\(\)\)\) \{ notify\("Save the open document before switching tabs\."\)/);
assert.match(source, /async function closeOpenDocumentTab\(id\)/);
assert.match(source, /document\.getElementById\(`open-document-tab-\$\{id\}`\)\?\.focus\(\)/);
assert.match(source, /event\.key === "ArrowRight"[\s\S]*event\.key === "Home"[\s\S]*event\.key === "End"/);
assert.match(source, /\{ id: activeId, title: title\(\), kind: "pdf", file \}/);
assert.match(source, /function flushActiveDocument\(\)[\s\S]*saveDocument\(true, true\)/);
assert.match(css, /\.open-document-tab-list\{display:flex;flex:1;min-width:0;align-items:stretch;gap:4px;overflow-x:auto/);
assert.match(css, /\.open-document-tab-dirty\{display:inline-block;width:6px;height:6px/);
assert.match(css, /\.open-document-tab:focus-visible[\s\S]*\.new-document-tab:focus-visible/);

process.stdout.write("Document tab tests passed: local documents can be switched, closed, and keyboard navigated.");

