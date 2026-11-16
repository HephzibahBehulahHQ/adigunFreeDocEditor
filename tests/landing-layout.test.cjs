const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
assert.match(css, /@media\(max-width:700px\)\{\s*\.workspace\{width:100%;min-width:0\}/, "the mobile workspace should stay within the viewport");
assert.match(css, /\.editor-card\.landing \.document-page\{width:100%;min-width:0;max-width:100%\}/, "the first-run canvas should shrink to the mobile workspace");
assert.match(css, /\.landing-actions\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, "mobile landing actions should fit in two columns");
assert.match(css, /\.landing-primary\{grid-column:1\/-1\}/, "the blank-document action should retain primary prominence");
assert.match(css, /@media\(max-width:360px\)\{\s*\.landing-actions\{grid-template-columns:1fr\}/, "narrow phones should use one action column");
process.stdout.write("Landing layout tests passed: mobile entry actions remain visible at narrow widths.\n");
