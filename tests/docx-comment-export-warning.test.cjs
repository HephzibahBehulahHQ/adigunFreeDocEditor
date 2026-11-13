const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const warningFunction = app.match(/function docxExportWarnings\(unsupported, omittedCommentCount\) \{[\s\S]*?\n  \}/)?.[0];
assert.ok(warningFunction, "DOCX export should explain unsupported content and omitted comments");

const getWarnings = new Function("return (" + warningFunction + ");")();
assert.deepEqual(getWarnings([], 0), []);

const singleComment = getWarnings([], 1);
assert.match(singleComment[0], /cannot match 1 local comment/);

const unsupported = getWarnings(["advanced styles"], 0);
assert.match(unsupported[0], /cannot preserve: advanced styles/);

const combined = getWarnings(["advanced styles"], 2);
assert.match(combined[0], /cannot preserve: advanced styles/);
assert.match(combined[1], /cannot match 2 local comments/);

assert.match(app, /function confirmDocxExport\(warnings\)/);
assert.match(app, /dialog\.showModal\(\)/);
assert.match(app, /if \(warnings\.length && !\(await confirmDocxExport\(warnings\)\)\) return;/);
assert.doesNotMatch(app, /window\.confirm\(warning\)/);

assert.match(html, /aria-describedby="docx-export-warning-description docx-export-warning-list docx-export-warning-note"/);

process.stdout.write("DOCX comment export warning tests passed.\n");
