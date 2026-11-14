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
    const objectStore = {
      getAll() { const result = { result: [] }; queueMicrotask(() => result.onsuccess?.()); return result; },
      put() {},
    };
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

  window.document.querySelector('[data-view="recent"]').click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(host.querySelector(".ProseMirror"), null, "leaving the document view destroys the live editor");
  assert.ok(host.querySelector(".empty-state"), "the document host returns to the document-list surface");
} finally {
  dom.window.close();
}

process.stdout.write("Application live editor tests passed: create mounts one editable root and leaving document mode restores the list surface.\n");
