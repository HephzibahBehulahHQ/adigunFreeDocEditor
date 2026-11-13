const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const fitRule = css.match(/\.zoom-button\.zoom-fit\{([^}]+)\}/g)?.at(-1);
assert.ok(fitRule, "fit zoom control has a CSS rule");
assert.match(fitRule, /min-height:24px/, "fit zoom control meets the minimum target height");
process.stdout.write("Zoom target-size tests passed: Fit has a minimum 24px height.\n");
