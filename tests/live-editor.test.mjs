import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createLiveEditor } from "../src/live-editor-runtime.js";
import { editorJSONToDocumentModel } from "../src/editor-schema.js";

const dom = new JSDOM("<!doctype html><html><body><article id='editor' contenteditable='true'><div class='document-sheet' data-editor-page='true' role='group' aria-label='Page 1'><p>Editable text</p></div></article></body></html>", {
  pretendToBeVisual: true,
  url: "https://example.test/",
});
for (const key of ["window", "document", "DOMParser", "Node", "Element", "HTMLElement", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "location"]) {
  globalThis[key] = key === "window" ? dom.window : key === "document" ? dom.window.document : dom.window[key];
}
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });

const element = document.querySelector("#editor");
let updates = 0;
const editor = createLiveEditor({ element, onUpdate: () => { updates += 1; } });
try {
  assert.equal(editor.view.dom.parentElement, element, "the live editing root mounts inside the persistent document host");
  assert.equal(element.contentEditable, "false", "the host does not create nested contenteditable regions");
  assert.equal(editor.view.dom.contentEditable, "true", "the ProseMirror root owns text editing");
  assert.equal(editor.getJSON().content[0].type, "documentSheet", "paginated sheet wrappers are recognized by the live schema");
  editor.commands.setTextSelection({ from: 2, to: 15 });
  assert.equal(editor.commands.toggleBold(), true, "Tiptap applies toolbar formatting as a document transaction");
  assert.match(editor.getHTML(), /<strong>Editable text<\/strong>/);
  assert.match(editor.getHTML(), /class="document-sheet"/);
  const model = editorJSONToDocumentModel(editor.getJSON());
  assert.equal(model.content[0].tag, "p", "visual page wrappers do not leak into persisted document content");
  assert.equal(updates, 1, "document transactions report updates to the application");
} finally {
  editor.destroy();
  dom.window.close();
}

process.stdout.write("Live editor tests passed: page sheets mount in the schema, formatting dispatches transactions, and model output flattens visual wrappers.\n");
