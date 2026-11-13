const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const labels = {
  "file-picker": "Choose a document or PDF file",
  "image-picker": "Choose an image to insert",
  "conversion-file-picker": "Choose a file to convert",
};
for (const [id, label] of Object.entries(labels)) {
  const input = html.match(new RegExp(`<input\\b[^>]*id="${id}"[^>]*>`))?.[0];
  assert.ok(input, `${id} exists`);
  assert.ok(input.includes(`aria-label="${label}"`), `${id} has an accessible name`);
}
process.stdout.write("File picker label tests passed: document, image, and conversion inputs have accessible names.\n");
