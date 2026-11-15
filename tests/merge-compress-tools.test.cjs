const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const vm = require("node:vm");

const app = fs.readFileSync(require.resolve("../app.js"), "utf8");
const mergeStart = app.indexOf("  function mergeQueueError()");
const mergeEnd = app.indexOf("  async function mergeDocuments()", mergeStart);
assert.ok(mergeStart >= 0 && mergeEnd > mergeStart, "merge queue validator is present");
const mergeQueueError = new Function("mergeQueue", app.slice(mergeStart, mergeEnd) + "\nreturn mergeQueueError;")([
  { name: "contract.pdf", size: 12 },
  { name: "notes.txt", size: 8 },
]);
assert.equal(mergeQueueError(), "", "text PDFs and text documents can be ordered together");
const mergeImplementationStart = app.indexOf("  async function mergeDocuments()");
const mergeImplementationEnd = app.indexOf("  function renderMergeQueue()", mergeImplementationStart);
assert.ok(mergeImplementationStart >= 0 && mergeImplementationEnd > mergeImplementationStart, "merge implementation is present");
assert.match(app.slice(mergeImplementationStart, mergeImplementationEnd), /extension === "pdf"[\s\S]*?extractPdfText\(file\)/, "PDF merge uses local selectable-text extraction");

const context = { self: {} };
vm.runInNewContext(fs.readFileSync(require.resolve("../assets/vendor/fflate.min.js"), "utf8"), context);
const fflate = context.self.fflate;
const zipWithLevel = (files, level) => new Promise((resolve, reject) => {
  fflate.zip(files, { level }, (error, bytes) => error ? reject(error) : resolve(bytes));
});
const compressStart = app.indexOf("  async function compressSelectedFile()");
const compressEnd = app.indexOf("  let mergeQueue = []", compressStart);
assert.ok(compressStart >= 0 && compressEnd > compressStart, "compression handler is present");

function makeCompressionHarness(file) {
  const elements = {
    "#compress-file": { files: [file] },
    "#compress-level": { value: "maximum" },
    "#compress-run": { disabled: false },
    "#compress-status": { textContent: "" },
  };
  const downloads = [];
  const compress = new Function("$", "zipWithLevel", "safeArchiveFileName", "formatToolBytes", "downloadToolFile", "ZIP_MAX_ARCHIVE_BYTES",
    app.slice(compressStart, compressEnd) + "\nreturn compressSelectedFile;")(
    (selector) => elements[selector], zipWithLevel, (name) => name, (size) => String(size), (bytes) => downloads.push(bytes), 100 * 1024 * 1024,
  );
  return { run: compress, downloads, elements };
}

function makeFile(name, bytes) {
  return { name, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

(async () => {
  const readable = makeCompressionHarness(makeFile("notes.txt", fflate.strToU8("repeatable text ".repeat(2000))));
  await readable.run();
  assert.equal(readable.downloads.length, 1, "a smaller ZIP is downloaded");
  assert.ok(readable.downloads[0].length < 32000);

  const randomBytes = new Uint8Array(32000);
  crypto.randomFillSync(randomBytes);
  const incompressible = makeCompressionHarness(makeFile("already-packed.bin", randomBytes));
  await incompressible.run();
  assert.equal(incompressible.downloads.length, 0, "a larger ZIP is not downloaded");
  assert.match(incompressible.elements["#compress-status"].textContent, /No larger ZIP was downloaded/);
  process.stdout.write("Merge and compression tests passed: PDF queueing and smaller-only ZIP downloads.\n");
})().catch((error) => {
  process.stderr.write((error.stack || String(error)) + "\n");
  process.exitCode = 1;
});

