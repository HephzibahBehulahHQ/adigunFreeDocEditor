const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.match(html, /id="toggle-outline"/, "outline control remains available");
assert.match(html, /id="assist-button"/, "Adigun control remains available");
assert.match(css, /@media\(min-width:701px\) and \(max-width:1050px\)\{\.stage-actions \.text-button\{min-height:36px\}\}/, "tablet stage actions have 36-pixel targets");
assert.match(css, /@media\(max-width:700px\)\{\.stage-actions \.text-button\{min-height:44px\}\}/, "mobile stage actions have 44-pixel targets");

process.stdout.write("Stage action target tests passed: Outline and Adigun meet responsive touch sizes.\n");
