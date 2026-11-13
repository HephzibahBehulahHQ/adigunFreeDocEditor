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
assert.match(source, /documentTabList\.querySelector\("\.open-document-tab-item\.active"\)\?\.scrollIntoView\(\{ block: "nearest", inline: "nearest" \}\)/);
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
assert.match(source, /function serializeOpenDocumentSession\(tabs, currentId\)/);
assert.match(source, /function parseOpenDocumentSession\(raw\)/);
assert.match(source, /async function restoreOpenDocumentTabs\(\)/);
assert.match(source, /return restoreOpenDocumentTabs\(\)/);
assert.match(source, /activeDocumentKind === "document" \? activeId : null/);
assert.match(source, /item\.kind === "document"/);
assert.doesNotMatch(source.match(/function serializeOpenDocumentSession\(tabs, currentId\)[\s\S]*?\n  function parseOpenDocumentSession/)[0], /title|content|file/);
assert.match(css, /\.open-document-tab-list\{display:flex;flex:1;min-width:0;align-items:stretch;gap:4px;overflow-x:auto/);
assert.match(css, /\.open-document-tab-dirty\{display:inline-block;width:6px;height:6px/);
assert.match(css, /\.open-document-tab:focus-visible[\s\S]*\.new-document-tab:focus-visible/);

function extractFunction(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start);
  assert.notEqual(start, -1, `${name} exists`);
  assert.notEqual(end, -1, `${nextName} follows ${name}`);
  return source.slice(start, end);
}

const sessionFunctions = `${extractFunction("serializeOpenDocumentSession", "parseOpenDocumentSession")}\n${extractFunction("parseOpenDocumentSession", "readOpenDocumentSession")}`;
const { serializeOpenDocumentSession, parseOpenDocumentSession } = new Function(`${sessionFunctions}; return { serializeOpenDocumentSession, parseOpenDocumentSession };`)();
const serialized = serializeOpenDocumentSession([
  { id: "doc-a", title: "Sensitive title", kind: "document", content: "Private content" },
  { id: "pdf-a", title: "PDF", kind: "pdf", file: {} },
  { id: "doc-a", title: "Duplicate", kind: "document" },
  { id: "doc-b", title: "Second", kind: "document" },
], "doc-b");
assert.deepEqual(JSON.parse(serialized), { version: 1, documentIds: ["doc-a", "doc-b"], activeId: "doc-b" });
assert.doesNotMatch(serialized, /Sensitive title|Private content|pdf-a/);
assert.deepEqual(parseOpenDocumentSession(serialized), { documentIds: ["doc-a", "doc-b"], activeId: "doc-b" });
assert.equal(parseOpenDocumentSession("{"), null);
assert.equal(parseOpenDocumentSession("x".repeat(8193)), null);
assert.equal(serializeOpenDocumentSession([{ id: "pdf-a", kind: "pdf" }], "pdf-a"), null);
assert.equal(serializeOpenDocumentSession([{ id: "doc-a", kind: "document" }], "other").includes('"activeId":null'), true);

process.stdout.write("Document tab tests passed: tabs restore by saved ID, PDFs stay session-only, and tabs remain keyboard accessible.");

