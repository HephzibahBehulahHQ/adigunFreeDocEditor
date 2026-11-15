const assert = require("node:assert/strict");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const app = fs.readFileSync(require.resolve("../app.js"), "utf8");
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
  const bytes = makeImagePdfBytes(new Uint8Array([255, 216, 255, 217]), 640, 480);
  assert.equal(String.fromCharCode(...bytes.slice(0, 8)), "%PDF-1.4");
  const pdfjs = await import(pathToFileURL(require.resolve("../assets/vendor/pdf.mjs")).href);
  const pdf = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  assert.equal(pdf.numPages, 1);
  assert.deepEqual(Array.from((await pdf.getPage(1)).view), [0, 0, 595.28, 841.89]);
  await pdf.destroy();
  process.stdout.write("Image-to-PDF tests passed: image source compatibility and one-page PDF structure.\n");
})().catch((error) => {
  process.stderr.write((error.stack || String(error)) + "\n");
  process.exitCode = 1;
});

