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

  window.__testEditor.commands.setContent("<p>Live text</p>");
  window.__testEditor.commands.setTextSelection({ from: 1, to: 10 });
  window.document.querySelector('#ribbon-tools [data-action="bold"]').click();
  assert.match(window.__testEditor.getHTML(), /<strong>Live text<\/strong>/, "the Home ribbon applies formatting through a live editor transaction");

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
  await new Promise((resolve) => setTimeout(resolve, 800));
  const saved = window.__savedDocuments.at(-1);
  assert.ok(saved, `the edited document is written to browser-local storage (status: ${window.document.querySelector("#save-label").textContent}, records: ${window.__savedDocuments.length})`);
  assert.equal(saved.content.content[0].attrs["data-indent-level"], "2", "saved documents retain the paragraph ruler indent");
  assert.equal(saved.content.content[0].attrs["data-line-spacing"], "1.5", "saved documents retain the toolbar line spacing");
  assert.equal(saved.content.content[0].attrs["data-paragraph-spacing"], "12", "saved documents retain the toolbar paragraph spacing");

  window.document.querySelector('[data-view="recent"]').click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(host.querySelector(".ProseMirror"), null, "leaving the document view destroys the live editor");
  assert.ok(host.querySelector(".empty-state"), "the document host returns to the document-list surface");
} finally {
  dom.window.close();
}

process.stdout.write("Application live editor tests passed: create mounts one editable root and leaving document mode restores the list surface.\n");
