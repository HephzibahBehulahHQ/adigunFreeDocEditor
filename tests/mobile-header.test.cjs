const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.match(html, /name="viewport"[^>]*viewport-fit=cover/, "mobile layout can account for display cutouts");
assert.match(html, /class="product-name"/);
assert.match(html, /class="mobile-brand"/);
assert.match(html, /id="document-title"/);
for (const id of ["mobile-menu", "save-document", "undo", "redo", "export-docx", "export-html"]) {
  assert.match(html, new RegExp(`id="${id}"`), `${id} remains available in the compact header`);
}

const mobileRules = css.split("@media(max-width:700px){").slice(1).join("\n");
assert.match(mobileRules, /\.sidebar\{justify-content:flex-start\}/);
assert.match(mobileRules, /\.product-name\{display:flex/);
assert.match(mobileRules, /\.mobile-brand\{display:none\}/);
assert.match(mobileRules, /\.workspace\.mode-no-document-title \.topbar\{height:0/);
assert.match(css, /@media\(min-width:901px\)\{\.workspace\.mode-no-document-title \.topbar\{display:none\}\}/);
assert.match(mobileRules, /\.workspace\.mode-no-document-title \.topbar-actions\{position:fixed/);
assert.match(mobileRules, /safe-area-inset-top/);
assert.match(mobileRules, /safe-area-inset-right/);
assert.match(mobileRules, /safe-area-inset-bottom/);
assert.match(mobileRules, /\.workspace\.mode-no-document-title \.mobile-menu-button\{color:#fff\}/);
assert.match(mobileRules, /@media\(max-width:420px\)\{[\s\S]*?\.document-title\{width:min\(110px,28vw\)/);
assert.match(mobileRules, /\.icon-button\{width:26px\}/);

const braceDelta = [...css].reduce((count, character) => count + (character === "{" ? 1 : character === "}" ? -1 : 0), 0);
assert.equal(braceDelta, 0, "stylesheet braces remain balanced");
process.stdout.write("Mobile header tests passed: product identity and editor actions fit the compact header rules.\n");


