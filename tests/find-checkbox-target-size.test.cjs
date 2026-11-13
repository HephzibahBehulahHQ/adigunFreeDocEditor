const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const label = css.match(/\.find-case\{([^}]+)\}/)?.[1];
assert.ok(label, "Match case has a dedicated label hit area");
assert.match(label, /min-height:28px/, "Match case label exceeds the 24px minimum target size");
process.stdout.write("Find checkbox target-size tests passed: Match case label has a 28px hit area.\n");
