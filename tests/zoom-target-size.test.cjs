const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const fitRule = css.match(/\.zoom-button\.zoom-fit\{([^}]+)\}/g)?.at(-1);
assert.ok(fitRule, "fit zoom control has a CSS rule");
assert.match(fitRule, /min-height:40px/, "compact fit zoom control has a larger touch target");
assert.match(css, /\.zoom-button\.zoom-fit\{[^}]*min-height:24px/, "desktop fit zoom control keeps its minimum target height");
assert.match(html, /<output id="zoom-value" aria-live="polite" aria-atomic="true">100%<\/output>/, "screen readers are notified when the zoom level changes");
assert.match(css, /@media\(max-width:560px\)\{[\s\S]*?\.page-footer\{align-items:stretch;flex-direction:column;gap:8px\}/, "compact page footer stacks statistics above controls");
assert.match(css, /\.language-indicator\{min-height:40px/);
assert.match(css, /\.zoom-button\{width:40px;height:40px;flex:none\}/, "mobile zoom controls have larger touch targets");
assert.match(css, /\.zoom-button\.zoom-fit\{min-width:44px;min-height:40px/);
process.stdout.write("Zoom tests passed: mobile footer controls stack with larger targets, and zoom changes are announced.\n");
