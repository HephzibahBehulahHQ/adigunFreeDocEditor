const assert = require("node:assert/strict");
const fs = require("node:fs");

const app = fs.readFileSync(require.resolve("../app.js"), "utf8");
assert.match(app, /pdfjs\\.GlobalWorkerOptions\\.workerSrc = new URL\\("\.\/assets\/vendor\/pdf\.worker\.mjs", document\.baseURI\\)\.href/);
const siteRootWorker = new URL("./assets/vendor/pdf.worker.mjs", "https://adigunfreedoceditor.hephzibahbehulah.com/").href;
assert.equal(siteRootWorker, "https://adigunfreedoceditor.hephzibahbehulah.com/assets/vendor/pdf.worker.mjs");
const nestedWorkspaceWorker = new URL("./assets/vendor/pdf.worker.mjs", "https://example.test/editor/").href;
assert.equal(nestedWorkspaceWorker, "https://example.test/editor/assets/vendor/pdf.worker.mjs");

const targetsStart = app.indexOf("  function renderConversionTargets(file)");
const targetsEnd = app.indexOf("  function renderConversionState()", targetsStart);
const targetSource = app.slice(targetsStart, targetsEnd);
assert.match(targetSource, /const pdfSources = \[\.\.\.pdfTextSources, \.\.\.imageSources\]/);
assert.match(targetSource, /value: "pdf", label: "PDF document", sources: pdfSources/);

const runnerStart = app.indexOf("  async function runConversion()");
const runnerEnd = app.indexOf("  function filterSavedDocumentList", runnerStart);
assert.match(app.slice(runnerStart, runnerEnd), /target === "pdf"[\s\S]*?convertImageToPdf\(file\)/);

const helperStart = app.indexOf("  function makeImagePdfBytes(");
const helperEnd = app.indexOf("  async function convertImageToPdf(", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "image PDF writer is present");
const makeImagePdfBytes = new Function(app.slice(helperStart, helperEnd) + "\nreturn makeImagePdfBytes;")();

(async () => {
  const jpegBytes = new Uint8Array([255, 216, 255, 217]);
  const bytes = makeImagePdfBytes(jpegBytes, 640, 480);
  assert.equal(String.fromCharCode(...bytes.slice(0, 8)), "%PDF-1.4");
  const text = Buffer.from(bytes).toString("latin1");
  const startXref = Number(text.match(/startxref\n(\d+)\n%%EOF$/)?.[1]);
  assert.equal(text.slice(startXref, startXref + 4), "xref", "PDF cross-reference points to its table");
  assert.match(text, /\/MediaBox \[0 0 595\.28 841\.89\]/, "image output uses a single A4 page");
  assert.match(text, /\/Subtype \/Image[\s\S]*?\/Filter \/DCTDecode/, "PDF embeds the JPEG as a compressed image object");
  assert.ok(Buffer.from(bytes).includes(Buffer.from(jpegBytes)), "JPEG image bytes are embedded in the PDF");
  const xrefLines = text.slice(startXref).split("\n");
  assert.equal(xrefLines[1], "0 6");
  for (let index = 1; index <= 5; index++) {
    const offset = Number(xrefLines[index + 2].slice(0, 10));
    assert.ok(text.slice(offset).startsWith(index + " 0 obj\n"), "xref entry points to object " + index);
  }
  process.stdout.write("Image-to-PDF tests passed: compatible source, embedded image, and valid cross-reference table.\n");
})().catch((error) => {
  process.stderr.write((error.stack || String(error)) + "\n");
  process.exitCode = 1;
});

