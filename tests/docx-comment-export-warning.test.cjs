const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const warningFunction = app.match(/function docxExportWarningMessage\(unsupported, commentCount\) \{[\s\S]*?\n  \}/)?.[0];
assert.ok(warningFunction, "DOCX export should explain unsupported content and omitted comments");

const getWarning = new Function("return (" + warningFunction + ");")();
assert.equal(getWarning([], 0), "");

const singleComment = getWarning([], 1);
assert.match(singleComment, /omit 1 local comment/);
assert.match(singleComment, /remain saved in this browser/);
assert.match(singleComment, /document saved in this browser will remain unchanged/);

const combined = getWarning(["advanced styles"], 2);
assert.match(combined, /cannot preserve: advanced styles/);
assert.match(combined, /omit 2 local comments/);
assert.match(combined, /Continue with Word export/);

assert.match(app, /docxExportWarningMessage\(wordPackage\.unsupported, reviewComments\.length\)/);
assert.match(app, /if \(warning && !window\.confirm\(warning\)\) return;/);

process.stdout.write("DOCX comment export warning tests passed.\n");
