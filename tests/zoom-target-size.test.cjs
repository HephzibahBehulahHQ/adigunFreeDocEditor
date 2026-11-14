const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const fitRule = css.match(/\.zoom-button\.zoom-fit\{([^}]+)\}/g)?.at(-1);
assert.ok(fitRule, "fit zoom control has a CSS rule");
assert.match(fitRule, /min-height:24px/, "fit zoom control meets the minimum target height");
assert.match(html, /<output id="zoom-value" aria-live="polite" aria-atomic="true">100%<\/output>/, "screen readers are notified when the zoom level changes");
process.stdout.write("Zoom tests passed: Fit meets the minimum target height and zoom changes are announced.\n");
