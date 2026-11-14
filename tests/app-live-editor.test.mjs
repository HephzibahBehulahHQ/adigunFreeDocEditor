import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dom = new JSDOM(fs.readFileSync(path.join(root, "index.html"), "utf8"), {
  pretendToBeVisual: true,
  runScripts: "outside-only",
  url: "https://example.test/",
});
const { window } = dom;
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.Element.prototype.scrollIntoView = () => {};
window.Range.prototype.getClientRects = () => [{ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }];
window.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
window.document.queryCommandState = () => false;
window.document.queryCommandValue = () => "";
Object.defineProperty(window.HTMLElement.prototype, "innerText", {
  configurable: true,
  get() { return this.textContent; },
  set(value) { this.textContent = value; },
});
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; };
window.indexedDB = {
  open() {
    const request = { result: null };
    const savedDocuments = [];
    const objectStore = {
      getAll() { const result = { result: [] }; queueMicrotask(() => result.onsuccess?.()); return result; },
      put(documentRecord) { savedDocuments.push(documentRecord); },
    };
    window.__savedDocuments = savedDocuments;
    request.result = {
      createObjectStore() {},
      transaction() {
        const tx = { objectStore: () => objectStore };
        setTimeout(() => tx.oncomplete?.(), 0);
        return tx;
      },
    };
    queueMicrotask(() => { request.onupgradeneeded?.(); request.onsuccess?.(); });
    return request;
  },
};

for (const file of ["document-model.js", "editor-runtime.js"]) {
  window.eval(fs.readFileSync(path.join(root, file), "utf8"));
}
const createLiveEditor = window.AdigunEditorRuntime.createLiveEditor;
window.AdigunEditorRuntime.createLiveEditor = (options) => {
  window.__testEditor = createLiveEditor(options);
  return window.__testEditor;
};
window.eval(fs.readFileSync(path.join(root, "app.js"), "utf8"));

try {
  await new Promise((resolve) => setTimeout(resolve, 10));
  window.document.querySelector("#landing-create").click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const host = window.document.querySelector("#document");
  const liveRoot = host.querySelector(":scope > .ProseMirror");
  assert.ok(liveRoot, "Create blank document mounts the live editing root in the document host");
  assert.equal(liveRoot.contentEditable, "true", "the ProseMirror root owns document editing");
  assert.equal(host.contentEditable, "false", "the persistent document host is not an editable ancestor");
  assert.equal(liveRoot.getAttribute("role"), "textbox", "the live editing root keeps the accessible textbox role");
  assert.equal(window.document.querySelector("#undo").disabled, true, "Undo is disabled when the new document has no history");
  assert.equal(window.document.querySelector("#redo").disabled, true, "Redo is disabled when the new document has no redo history");

  window.__testEditor.commands.setContent("<h1>Chapter</h1><h6>Footnote</h6>");
  const outlineItems = [...window.document.querySelectorAll("#outline-list .outline-item")];
  assert.deepEqual(outlineItems.map((item) => item.textContent), ["Chapter", "Footnote"], "the document outline renders real heading text");
  assert.deepEqual(outlineItems.map((item) => item.getAttribute("aria-label")), ["Heading 1: Chapter", "Heading 6: Footnote"], "assistive technology can distinguish heading levels in the outline");
  window.__testEditor.commands.setContent("<p>Live text</p>");
  window.__testEditor.commands.setTextSelection({ from: 1, to: 10 });
  const blockStyle = window.document.querySelector('#ribbon-tools [data-tool="block"]');
  assert.deepEqual([...blockStyle.options].map((option) => option.textContent), ["Normal", "Heading 1", "Heading 2", "Heading 3", "Heading 4", "Heading 5", "Heading 6"], "the text-style menu exposes all supported semantic heading levels");
  blockStyle.value = "h1";
  blockStyle.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(window.__testEditor.getJSON().content[0].attrs.level, 1, "Heading 1 applies the first-level heading node");
  assert.equal(blockStyle.value, "h1", "the heading control reflects the active live heading");
  blockStyle.value = "h4";
  blockStyle.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(window.__testEditor.getJSON().content[0].attrs.level, 4, "Heading 4 applies the fourth-level heading node");
  assert.equal(blockStyle.value, "h4", "the heading control reflects deeper live heading levels");
  window.document.querySelector('#ribbon-tools [data-action="bold"]').click();
  assert.match(window.__testEditor.getHTML(), /<strong>Live text<\/strong>/, "the Home ribbon applies formatting through a live editor transaction");
  assert.equal(window.document.querySelector('#ribbon-tools [data-action="bold"]').getAttribute("aria-pressed"), "true", "the Home ribbon shows bold as active for the live selection");
  assert.equal(window.document.querySelector("#undo").disabled, false, "Undo enables after a live editor transaction");
  assert.equal(window.document.querySelector('#ribbon-tools [data-action="undo"]').disabled, false, "ribbon Undo enables after a live editor transaction");

  const fontSize = window.document.querySelector('#ribbon-tools [data-tool="size"]');
  fontSize.value = "14pt";
  fontSize.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(window.__testEditor.getAttributes("textStyle").fontSize, "14pt", "font size updates through the live text-style mark");
  assert.match(window.__testEditor.getHTML(), /data-font-size="14pt"[^>]*style="[^"]*font-size:\s*14pt/, "font size remains visible on the live editor surface");

  window.document.querySelector('#ribbon-tools [data-action="indent"]').click();
  assert.equal(window.__testEditor.getJSON().content[0].attrs.indentLevel, "1", "Increase indent updates the structured paragraph attributes");
  assert.match(window.__testEditor.getHTML(), /data-indent-level="1"[^>]*style="[^"]*margin-left:\s*36pt/, "paragraph indent remains visible on the live editor surface");

  const indentRuler = window.document.querySelector('#paragraph-indent-ruler');
  indentRuler.value = "2";
  indentRuler.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(window.__testEditor.getJSON().content[0].attrs.indentLevel, "2", "the paragraph ruler updates the structured paragraph attributes");
  assert.match(window.__testEditor.getHTML(), /data-indent-level="2"[^>]*style="[^"]*margin-left:\s*72pt/, "ruler indent remains visible on the live editor surface");

  const lineSpacing = window.document.querySelector('#ribbon-tools [data-tool="line-spacing"]');
  lineSpacing.value = "1.5";
  lineSpacing.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(window.__testEditor.getJSON().content[0].attrs.lineSpacing, "1.5", "Line spacing updates the structured paragraph attributes");
  assert.match(window.__testEditor.getHTML(), /data-line-spacing="1.5"/, "line spacing persists as a structured paragraph attribute");
  assert.match(window.__testEditor.getHTML(), /line-height:\s*1\.5/, "line spacing remains visible on the live editor surface");

  const paragraphSpacing = window.document.querySelector('#ribbon-tools [data-tool="paragraph-spacing"]');
  paragraphSpacing.value = "12";
  paragraphSpacing.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(window.__testEditor.getJSON().content[0].attrs.paragraphSpacing, "12", "Paragraph spacing updates the structured paragraph attributes");
  assert.match(window.__testEditor.getHTML(), /margin-bottom:\s*12pt/, "paragraph spacing remains visible on the live editor surface");
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const saved = window.__savedDocuments.at(-1);
  assert.ok(saved, `the edited document is written to browser-local storage (status: ${window.document.querySelector("#save-label").textContent}, records: ${window.__savedDocuments.length})`);
  assert.equal(saved.content.content[0].attrs["data-indent-level"], "2", "saved documents retain the paragraph ruler indent");
  assert.equal(saved.content.content[0].attrs["data-line-spacing"], "1.5", "saved documents retain the toolbar line spacing");
  assert.equal(saved.content.content[0].attrs["data-paragraph-spacing"], "12", "saved documents retain the toolbar paragraph spacing");
  assert.match(JSON.stringify(saved.content), /data-font-size.*14pt/, "saved documents retain the Home ribbon font size");

  const listButton = window.document.querySelector('#ribbon-tools [data-action="insertUnorderedList"]');
  listButton.click();
  assert.equal(window.__testEditor.isActive("bulletList"), true, "the Home ribbon creates a real bulleted list");
  assert.equal(listButton.getAttribute("aria-pressed"), "true", "the Home ribbon marks the active list state");

  window.__testEditor.commands.setContent("<p>Table anchor</p>");
  window.__testEditor.commands.setTextSelection({ from: 1, to: 1 });
  window.document.querySelector("#ribbon-tab-insert").click();
  window.document.querySelector('#ribbon-tools [data-action="table"]').click();
  window.document.querySelector("#table-rows").value = "2";
  window.document.querySelector("#table-columns").value = "2";
  window.document.querySelector("#table-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const table = liveRoot.querySelector("table");
  assert.ok(table, "the Insert ribbon creates a table in the live document");
  const firstCellParagraph = table.querySelector("th p");
  const tableSelection = window.document.createRange();
  tableSelection.setStart(firstCellParagraph, 0);
  tableSelection.collapse(true);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(tableSelection);
  window.document.dispatchEvent(new window.Event("selectionchange"));
  const insertRowBelow = window.document.querySelector('#ribbon-tools [data-action="table-row-below"]');
  assert.equal(insertRowBelow.disabled, false, "table row actions enable when the caret is in a cell");
  insertRowBelow.click();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(table.querySelectorAll("tr").length, 3, "Insert Row Below updates the visible live table");
  const findTableNode = (node) => node.type === "table" ? node : node.content?.map(findTableNode).find(Boolean);
  const liveTable = findTableNode(window.__testEditor.getJSON());
  assert.equal(liveTable.content.length, 3, "inserted table rows enter the structured Tiptap document model");
  const findStoredTable = (nodes) => nodes.flatMap((node) => node.type === "element" && node.tag === "table" ? [node] : node.children ? findStoredTable(node.children) : []);
  const domTables = findStoredTable(window.AdigunDocumentModel.fromDOM(liveRoot).content);
  assert.equal(domTables.length, 1, "live editor DOM serialization retains inserted tables");
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const savedWithTable = window.__savedDocuments.at(-1);
  const savedTables = findStoredTable(savedWithTable?.content?.content || []);
  const countRows = (nodes) => nodes.reduce((count, node) => count + (node.tag === "tr" ? 1 : 0) + countRows(node.children || []), 0);
  assert.equal(countRows(savedTables.at(-1)?.children || []), 3, "inserted table rows autosave to the browser document model");
  window.document.querySelector('[data-view="recent"]').click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(host.querySelector(".ProseMirror"), null, "leaving the document view destroys the live editor");
  assert.ok(host.querySelector(".empty-state"), "the document host returns to the document-list surface");
} finally {
  dom.window.close();
}

process.stdout.write("Application live editor tests passed: create mounts one editable root and leaving document mode restores the list surface.\n");
