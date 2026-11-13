const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

const filterFunction = app.match(/function filterSavedDocumentList\(value\) \{[\s\S]*?\n  \}/)?.[0];
assert.ok(filterFunction, "Saved-document lists should expose a title filter");
assert.match(app, /id="document-list-search"/);
assert.match(app, /event\.target\?\.id === "document-list-search"\) \{ filterSavedDocumentList\(event\.target\.value\); return; \}/);
assert.match(app, /event\.target\?\.id === "document-list-search"\) return;/);
assert.match(css, /\.document-list-filter input:focus-visible/);

const rows = [
  { title: "Meeting notes", hidden: false },
  { title: "Project brief", hidden: false },
  { title: "Untitled document", hidden: false },
].map((row) => ({
  ...row,
  querySelector(selector) {
    assert.equal(selector, "[data-open-id]");
    return { textContent: this.title };
  },
}));
const resultCount = { textContent: "" };
const emptyState = { hidden: true };
const controls = new Map([
  ["#document-list-result-count", resultCount],
  ["#document-list-empty", emptyState],
]);
const editor = { querySelectorAll(selector) { assert.equal(selector, ".recent-row"); return rows; } };
const filterFactory = new Function("editor", "$", "return (" + filterFunction + ");");
const filterSavedDocumentList = filterFactory(editor, (selector) => controls.get(selector));

filterSavedDocumentList(" MEETING ");
assert.deepEqual(rows.map((row) => row.hidden), [false, true, true]);
assert.equal(resultCount.textContent, "1 match");
assert.equal(emptyState.hidden, true);

filterSavedDocumentList("missing");
assert.deepEqual(rows.map((row) => row.hidden), [true, true, true]);
assert.equal(resultCount.textContent, "0 matches");
assert.equal(emptyState.hidden, false);

filterSavedDocumentList("");
assert.deepEqual(rows.map((row) => row.hidden), [false, false, false]);
assert.equal(resultCount.textContent, "3 documents");
assert.equal(emptyState.hidden, true);

process.stdout.write("Document list search tests passed.\n");
