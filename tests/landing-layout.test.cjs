const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
assert.match(css, /@media\(max-width:700px\)\{\s*\.workspace\{width:100%;min-width:0\}/, "the mobile workspace should stay within the viewport");
assert.match(css, /\.workspace\.mode-no-document-title\{width:100%;max-width:100%;overflow-x:hidden\}/, "empty workspace views should fit the layout viewport without causing page overflow");
assert.match(css, /\.workspace\.mode-no-document-title \.editor-card\.landing\{max-width:calc\(100vw - 22px\)\}/, "the landing card should remain inside the viewport");
assert.match(css, /\.landing-actions\{width:100%;max-width:calc\(100vw - 70px\)\}/, "the mobile action grid should fit within page padding");
assert.match(css, /\.editor-card\.landing \.document-page\{width:100%;min-width:0;max-width:100%\}/, "the first-run canvas should shrink to the mobile workspace");
assert.match(css, /\.landing-actions\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, "mobile landing actions should fit in two columns");
assert.match(css, /\.landing-primary\{grid-column:1\/-1\}/, "the blank-document action should retain primary prominence");
assert.match(css, /@media\(max-width:420px\)\{\s*\.landing-actions\{grid-template-columns:1fr\}/, "small phones should use one action column");
process.stdout.write("Landing layout tests passed: mobile entry actions remain visible at narrow widths.\n");
