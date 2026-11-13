const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = app.indexOf("  function orderedDocxRevisionOperations(");
const end = app.indexOf("  function mapDocxRevisionsToHtml(", start);
assert.ok(start >= 0 && end > start, "DOCX revision ordering helper is present");
const orderOperations = new Function(`${app.slice(start, end)}; return orderedDocxRevisionOperations;`)();

const first = { kind: "delete", text: "first", start: 4 };
const second = { kind: "insert", text: "second", start: 4 };
const later = { kind: "delete", text: "later", start: 9 };
const middle = { kind: "insert", text: "middle", start: 7 };
assert.deepEqual(orderOperations([first, second, middle, later]), [
  { operation: later, operationIndex: 3 },
  { operation: middle, operationIndex: 2 },
  { operation: second, operationIndex: 1 },
  { operation: first, operationIndex: 0 },
]);
process.stdout.write("DOCX revision ordering tests passed: descending offsets and reverse tie order preserve source order when ranges are inserted.\\n");
