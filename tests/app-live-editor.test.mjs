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
window.TextDecoder = globalThis.TextDecoder;
window.TextEncoder = globalThis.TextEncoder;
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
const savedDocuments = [];
window.__savedDocuments = savedDocuments;
window.indexedDB = {
  open() {
    const request = { result: null };
    const objectStore = {
      getAll() { const result = { result: [] }; queueMicrotask(() => result.onsuccess?.()); return result; },
      put(documentRecord) { savedDocuments.push(documentRecord); },
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

for (const file of ["document-model.js", "editor-runtime.js", "assets/vendor/fflate.min.js"]) {
  window.eval(fs.readFileSync(path.join(root, file), "utf8"));
}
window.__downloads = [];
window.URL.createObjectURL = (blob) => { window.__lastDownloadedBlob = blob; return "blob:https://example.test/generated"; };
window.URL.revokeObjectURL = () => {};
window.HTMLAnchorElement.prototype.click = function () { window.__downloads.push(this.download); };
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
  const toolViews = [
    ["convert", "conversion-workspace", "Convert File"],
    ["merge", "merge-workspace", "Merge documents"],
    ["compress", "compress-workspace", "Compress a file"],
    ["unzip", "unzip-workspace", "Unzip Files"],
    ["translate", "translate-workspace", "Translate a document"],
  ];
  for (const [view, workspaceId, title] of toolViews) {
    window.document.querySelector(`[data-view="${view}"]`).click();
    assert.equal(window.document.querySelector("#stage-title").textContent, title, `${view} opens its own titled tool workspace`);
    assert.equal(window.document.querySelector("#" + workspaceId).hidden, false, `${view} workspace is visible`);
    assert.equal(window.document.querySelectorAll(".file-tool-workspace:not([hidden])").length, view === "convert" ? 0 : 1, "only the selected file tool is visible");
  }
  assert.deepEqual([...window.document.querySelectorAll("#conversion-target option")].map((option) => option.value), ["html", "docx", "markdown", "pdf", "png", "jpeg", "webp", "svg", "pptx"], "conversion lists the requested output formats");
  assert.equal(window.document.querySelector("#conversion-target").options[2].disabled, false, "Markdown output is available");
  assert.equal(window.document.querySelector("#conversion-target").options[3].disabled, false, "PDF output is available");
  assert.equal(window.document.querySelector("#conversion-target").options[7].disabled, false, "SVG document output is available");
  const conversionInput = window.document.querySelector("#conversion-file-picker");
  const pptxInputFile = { name: "presentation.txt", size: 30, text: async () => "Title line\nFirst point\nSecond point\nThird point\nFourth point\nFifth point\nSixth point" };
  Object.defineProperty(conversionInput, "files", { configurable: true, value: [pptxInputFile] });
  conversionInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  const realZip = window.fflate.zip;
  window.fflate.zip = (parts, options, callback) => { window.__pptxParts = parts; callback(null, new Uint8Array([1, 2, 3])); };
  window.document.querySelector("#conversion-target").value = "pptx";
  window.document.querySelector("#conversion-run").click();
  for (let attempt = 0; attempt < 100 && !window.document.querySelector("#conversion-progress").textContent.includes("Conversion complete."); attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(window.document.querySelector("#conversion-result-name").textContent, /presentation\.pptx$/);
  assert.ok(window.__pptxParts["ppt/slides/slide1.xml"] && window.__pptxParts["ppt/slides/slide2.xml"], "long text is split across valid PowerPoint slide parts");
  assert.match(window.fflate.strFromU8(window.__pptxParts["ppt/slides/slide1.xml"]), /presentation/);
  assert.match(window.fflate.strFromU8(window.__pptxParts["[Content_Types].xml"]), /presentationml.presentation.main\+xml/);
  for (const [name, bytes] of Object.entries(window.__pptxParts)) {
    if (!name.endsWith(".xml") && !name.endsWith(".rels")) continue;
    const documentXml = new window.DOMParser().parseFromString(window.fflate.strFromU8(bytes), "application/xml");
    assert.equal(documentXml.querySelector("parsererror"), null, name + " is well-formed XML");
  }
  window.document.querySelector("#conversion-download").click();
  assert.equal(window.__downloads.at(-1), "presentation.pptx", "PowerPoint conversion offers a downloadable .pptx");
  window.fflate.zip = realZip;
  const pdfInputFile = { name: "report.txt", size: 24, text: async () => "First paragraph.\\nSecond paragraph with euro €." };
  Object.defineProperty(conversionInput, "files", { configurable: true, value: [pdfInputFile] });
  conversionInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  window.document.querySelector("#conversion-target").value = "pdf";
  window.document.querySelector("#conversion-run").click();
  for (let attempt = 0; attempt < 100 && !window.document.querySelector("#conversion-progress").textContent.includes("Conversion complete."); attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(window.document.querySelector("#conversion-result-name").textContent, "report.pdf");
  window.document.querySelector("#conversion-download").click();
  const pdfBuffer = await new Promise((resolve, reject) => { const reader = new window.FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(window.__lastDownloadedBlob); });
  const pdfText = window.TextDecoder ? new window.TextDecoder().decode(new Uint8Array(pdfBuffer)) : String.fromCharCode(...new Uint8Array(pdfBuffer));
  assert.ok(pdfText.startsWith("%PDF-1.4") && pdfText.includes("/Type /Page") && pdfText.includes("%%EOF"), "PDF download contains a complete page structure");
  assert.equal(window.__downloads.at(-1), "report.pdf", "PDF conversion produces a downloadable .pdf");

  const svgSource = { name: "poster.txt", size: 34, text: async () => "An SVG heading\\nA scalable paragraph." };
  Object.defineProperty(conversionInput, "files", { configurable: true, value: [svgSource] });
  conversionInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  window.document.querySelector("#conversion-target").value = "svg";
  window.document.querySelector("#conversion-run").click();
  for (let attempt = 0; attempt < 100 && !window.document.querySelector("#conversion-progress").textContent.includes("Conversion complete."); attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(window.document.querySelector("#conversion-result-name").textContent, "poster.svg");
  window.document.querySelector("#conversion-download").click();
  const svgText = await new Promise((resolve, reject) => { const reader = new window.FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsText(window.__lastDownloadedBlob); });
  const svgXml = new window.DOMParser().parseFromString(svgText, "application/xml");
  assert.equal(svgXml.querySelector("parsererror"), null, "SVG output is well-formed XML");
  assert.match(svgText, /<svg[^>]+viewBox=/);
  assert.match(svgText, /An SVG heading/);
  assert.equal(window.__downloads.at(-1), "poster.svg", "SVG illustration produces a downloadable .svg file");
  const markdownSource = { name: "notes.txt", size: 16, text: async () => "# Heading\nA **bold** line." };
  Object.defineProperty(conversionInput, "files", { configurable: true, value: [markdownSource] });
  conversionInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  window.document.querySelector("#conversion-target").value = "markdown";
  window.document.querySelector("#conversion-run").click();
  for (let attempt = 0; attempt < 100 && !window.document.querySelector("#conversion-progress").textContent.includes("Conversion complete."); attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(window.document.querySelector("#conversion-result-name").textContent, /notes\.md$/);
  window.document.querySelector("#conversion-download").click();
  assert.equal(window.__downloads.at(-1), "notes.md", "Markdown conversion enables a downloadable .md result");
  const imageSource = { name: "photo.png", size: 4, type: "image/png" };
  Object.defineProperty(conversionInput, "files", { configurable: true, value: [imageSource] });
  conversionInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.deepEqual([...window.document.querySelectorAll("#conversion-target option")].map((option) => option.value), ["pdf", "png", "jpeg", "webp"], "image sources expose PDF and supported image output formats");
  window.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
  window.HTMLCanvasElement.prototype.getContext = () => ({ fillStyle: "", fillRect() {}, drawImage() {} });
  window.HTMLCanvasElement.prototype.toBlob = function (callback, type) {
    const blob = new window.Blob(["image"], { type });
    blob.arrayBuffer = async () => Uint8Array.from([105, 109, 97, 103, 101]).buffer;
    callback(blob);
  };
  window.document.querySelector("#conversion-target").value = "pdf";
  window.document.querySelector("#conversion-run").click();
  for (let attempt = 0; attempt < 100 && !window.document.querySelector("#conversion-progress").textContent.includes("Image-to-PDF conversion complete."); attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(window.document.querySelector("#conversion-progress").textContent, /Image-to-PDF conversion complete\./, "image-to-PDF conversion should finish: " + window.document.querySelector("#conversion-progress").textContent);
  assert.match(window.document.querySelector("#conversion-result-name").textContent, /photo\.pdf$/);
  window.document.querySelector("#conversion-download").click();
  assert.equal(window.__downloads.at(-1), "photo.pdf", "image conversion produces a downloadable PDF file");
  window.document.querySelector("#conversion-target").value = "webp";
  window.document.querySelector("#conversion-run").click();
  for (let attempt = 0; attempt < 100 && !window.document.querySelector("#conversion-progress").textContent.includes("Image conversion complete."); attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(window.document.querySelector("#conversion-result-name").textContent, /photo\.webp$/);
  window.document.querySelector("#conversion-download").click();
  assert.equal(window.__downloads.at(-1), "photo.webp", "image conversion produces a downloadable WebP file");


  assert.ok(window.document.querySelector("#translate-target-language").options.length >= 70, "translation language pickers offer a broad language list");
  assert.ok([...window.document.querySelectorAll("#translate-output-format option")].some((option) => option.value === "pdf"), "translation offers PDF output by default");
  assert.ok(window.document.querySelector("#translate-file").accept.includes("application/pdf"), "translation accepts PDF input");
  assert.equal(window.document.querySelector("#translate-run").disabled, true, "translation stays disabled until a provider is configured");
  window.fetch = async (url) => url.endsWith("/languages")
    ? { ok: true, json: async () => [{ code: "en", name: "English", targets: ["fr"] }, { code: "fr", name: "French", targets: ["en"] }] }
    : url.endsWith("/frontend/settings")
      ? { ok: true, json: async () => ({ keyRequired: true }) }
      : { ok: true, json: async () => ({ translatedText: "Bonjour" }) };
  window.document.querySelector("#translate-provider-url").value = "https://translation.example";
  window.document.querySelector("#translate-connect").click();
  for (let attempt = 0; attempt < 100 && !window.document.querySelector("#translate-provider-status").textContent.includes("Connected"); attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
  const translationInput = window.document.querySelector("#translate-file");
  Object.defineProperty(translationInput, "files", { configurable: true, value: [{ name: "letter.txt", size: 5, text: async () => "Hello" }] });
  translationInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  window.document.querySelector("#translate-source-language").value = "en";
  window.document.querySelector("#translate-source-language").dispatchEvent(new window.Event("change", { bubbles: true }));
  window.document.querySelector("#translate-target-language").value = "fr";
  window.document.querySelector("#translate-target-language").dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.match(window.document.querySelector("#translate-provider-status").textContent, /requires an API key/);
  assert.equal(window.document.querySelector("#translate-run").disabled, true, "required provider keys disable Translate until supplied");
  window.document.querySelector("#translate-api-key").value = "synthetic-test-key";
  window.document.querySelector("#translate-api-key").dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(window.document.querySelector("#translate-run").disabled, false, "entering a provider key enables translation without reconnecting");
  window.document.querySelector("#translate-run").click();
  for (let attempt = 0; attempt < 100 && !window.document.querySelector("#translate-status").textContent.includes("Translation ready as PDF"); attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(window.document.querySelector("#translate-status").textContent, /Translation ready as PDF/);
  assert.equal(window.document.querySelector("#translate-download").disabled, false);
  window.document.querySelector("#translate-download").click();
  assert.equal(window.__downloads.at(-1), "letter.translated.pdf", "translation downloads a PDF output");
  const translationPdf = await new Promise((resolve, reject) => {
    const reader = new window.FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(window.__lastDownloadedBlob);
  });
  assert.equal(String.fromCharCode(...translationPdf.slice(0, 8)), "%PDF-1.4", "translated PDF download contains a PDF document");

  const mergeInput = window.document.querySelector("#merge-files");
  const files = [
    { name: "one.txt", size: 10, text: async () => "First document." },
    { name: "two.txt", size: 11, text: async () => "Second document." },
    { name: "three.txt", size: 12, text: async () => "Third document." },
  ];
  Object.defineProperty(mergeInput, "files", { configurable: true, value: files });
  mergeInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(window.document.querySelectorAll("#merge-file-order .tool-file-row").length, 3, "merge files appear in an ordered queue");
  const moveDown = window.document.querySelector('#merge-file-order [data-merge-action="down"]');
  moveDown.click();
  assert.equal(window.document.querySelector("#merge-file-order .tool-file-row span").textContent, "two.txt", "merge queue supports ordering files");
  window.document.querySelector("#merge-run").click();
  for (let attempt = 0; attempt < 200 && !window.document.querySelector("#merge-status").textContent.includes("Merge complete."); attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(window.__downloads.at(-1), "merged-documents.docx", "merge creates a downloadable Word document");
  const mergedBuffer = await new Promise((resolve, reject) => {
    const reader = new window.FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(window.__lastDownloadedBlob);
  });
  const mergedArchive = window.fflate.unzipSync(new Uint8Array(mergedBuffer));
  const mergedXml = window.fflate.strFromU8(mergedArchive["word/document.xml"]);
  assert.ok(mergedXml.indexOf("two.txt") < mergedXml.indexOf("one.txt") && mergedXml.indexOf("one.txt") < mergedXml.indexOf("three.txt"), "the output follows the selected merge order");
  assert.match(window.document.querySelector("#merge-status").textContent, /Merge complete/);
  const archiveBytes = window.fflate.zipSync({ "docs/readme.md": window.fflate.strToU8("hello") }, { level: 0 });
  window.fflate.unzip = (data, options, callback) => { setTimeout(() => callback(null, { "docs/readme.md": window.fflate.strToU8("hello") }), 0); return () => {}; };
  const archive = { name: "bundle.zip", size: archiveBytes.length, arrayBuffer: async () => archiveBytes.buffer.slice(archiveBytes.byteOffset, archiveBytes.byteOffset + archiveBytes.byteLength) };
  const unzipInput = window.document.querySelector("#unzip-file");
  Object.defineProperty(unzipInput, "files", { configurable: true, value: [archive] });
  window.document.querySelector('[data-view="unzip"]').click();
  unzipInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  for (let attempt = 0; attempt < 200 && !/ files extracted · /.test(window.document.querySelector("#unzip-status").textContent); attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(window.document.querySelectorAll("#unzip-file-list [data-extracted-index]").length, 1, "ZIP contents appear as individual downloads; status: " + window.document.querySelector("#unzip-status").textContent);
  assert.match(window.document.querySelector("#unzip-status").textContent, /1 files extracted/);
  assert.equal(window.document.querySelector("#unzip-download-all").disabled, false, "Download all enables after extraction");
  window.document.querySelector('#unzip-file-list [data-extracted-index="0"]').click();
  assert.equal(window.__downloads.at(-1), "docs/readme.md", "individual extracted files download with safe names");
  window.fflate.zip = (contents, options, callback) => { window.__zipRequests = [...(window.__zipRequests || []), { contents, options }]; setTimeout(() => callback(null, new Uint8Array([1, 2, 3])), 0); return () => {}; };
  window.document.querySelector("#unzip-download-all").click();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(window.__zipRequests.at(-1).contents["docs/readme.md"].length, 5, "download all repacks the extracted files together");
  assert.equal(window.__downloads.at(-1), "bundle-extracted.zip", "all extracted files download in one ZIP");
  const compressedInput = window.document.querySelector("#compress-file");
  const smallFileBytes = window.fflate.strToU8("sample text");
  const localFile = { name: "notes.txt", size: smallFileBytes.length, arrayBuffer: async () => smallFileBytes.buffer.slice(smallFileBytes.byteOffset, smallFileBytes.byteOffset + smallFileBytes.byteLength) };
  Object.defineProperty(compressedInput, "files", { configurable: true, value: [localFile] });
  window.document.querySelector('[data-view="compress"]').click();
  compressedInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  window.document.querySelector("#compress-level").value = "maximum";
  window.document.querySelector("#compress-level").dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(window.document.querySelector("#compress-run").disabled, false, "Compress enables once a file is selected");
  window.document.querySelector("#compress-run").click();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(window.__zipRequests.at(-1).options.level, 9, "Maximum compression uses ZIP compression level 9");
  assert.equal(window.__zipRequests.at(-1).contents["notes.txt"].length, 11, "the selected file is placed in the ZIP output");
  assert.equal(window.__downloads.at(-1), "notes.txt.zip", "the compressed ZIP is downloaded");
  window.document.querySelector('[data-view="recent"]').click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(host.querySelector(".ProseMirror"), null, "leaving the document view destroys the live editor");
  assert.ok(host.querySelector(".empty-state"), "the document host returns to the document-list surface");
} finally {
  dom.window.close();
}

process.stdout.write("Application live editor tests passed: create mounts one editable root and leaving document mode restores the list surface.\n");


