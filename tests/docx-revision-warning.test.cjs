const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const warningStart = app.indexOf("  function sourceRevisionLossWarning(");
const warningEnd = app.indexOf("  function sanitizeDocxHtml(", warningStart);
assert.ok(warningStart >= 0 && warningEnd > warningStart, "revision loss messaging is defined");
const sourceRevisionLossWarning = new Function(`${app.slice(warningStart, warningEnd)}; return sourceRevisionLossWarning;`)();
assert.equal(sourceRevisionLossWarning({ insertions: 0, deletions: 0 }), "", "documents without revisions do not get a loss warning");
assert.match(sourceRevisionLossWarning({ insertions: 2, deletions: 1 }), /2 insertions and 1 deletion.*not preserved/);
assert.match(sourceRevisionLossWarning(null, true), /status could not be checked.*may be lost in this conversion/);
assert.match(app, /const revisionCounts = await readDocxRevisionCounts\(arrayBuffer, archiveEntry\)/);
assert.match(app, /if \(revisionWarning\) warnings\.push\(revisionWarning\)/);
assert.match(app, /if \(revisionWarning\) notes\.push\(revisionWarning\)/);
process.stdout.write("DOCX revision warning tests passed: warnings reflect source revision counts and inspection uncertainty.\n");
