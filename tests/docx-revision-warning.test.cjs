const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
assert.match(app, /warnings\.push\("Tracked changes from the source are not retained in this conversion\."\)/);
assert.match(app, /notes\.push\("Tracked changes from the source are not preserved"\)/);
process.stdout.write("DOCX revision warning tests passed: import and conversion disclose tracked-change loss.\n");
