const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
assert.match(app, /Create a document or open a supported file to get started\./);
assert.doesNotMatch(app, /this first workspace/, "landing copy should not describe the product as an in-development slice");
const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const catalogStart = app.indexOf("const documentTemplates = {");
const catalogEnd = app.indexOf("  async function createDocument(template)", catalogStart);
assert.ok(catalogStart >= 0 && catalogEnd > catalogStart, "template catalog is present");
const catalog = app.slice(catalogStart, catalogEnd);
const landingStart = app.indexOf('class="landing-template-grid"');
const landingEnd = app.indexOf('class="landing-dropzone"', landingStart);
const landing = app.slice(landingStart, landingEnd);
const dialog = index.slice(index.indexOf('id="template-dialog"'));
const templateIds = ["meeting", "project", "letter", "status", "research", "resume"];
for (const id of templateIds) {
  assert.ok(catalog.includes("    " + id + ": {"), id + " template has editable content");
  assert.ok(landing.includes('data-template="' + id + '"'), id + " appears on the first-use screen");
  assert.ok(dialog.includes('data-template="' + id + '"'), id + " appears in the Templates dialog");
}
process.stdout.write("Landing copy tests passed: entry screen uses concise, user-facing wording.\\n");

