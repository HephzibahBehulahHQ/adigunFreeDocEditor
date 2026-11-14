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
assert.match(mobileRules, /\.sidebar\.mobile-open \.nav-item\{[^}]*min-height:44px/, "expanded mobile navigation rows meet the touch target");
assert.match(mobileRules, /\.product-name\{display:flex/);
assert.match(mobileRules, /\.mobile-brand\{display:none\}/);
assert.match(mobileRules, /\.workspace\.mode-no-document-title \.topbar\{height:0/);
assert.match(css, /@media\(min-width:1051px\)\{\.workspace\.mode-no-document-title \.topbar\{display:none\}\}/);
assert.match(mobileRules, /\.workspace\.mode-no-document-title \.topbar-actions\{position:fixed/);
assert.match(mobileRules, /safe-area-inset-top/);
assert.match(mobileRules, /safe-area-inset-right/);
assert.match(mobileRules, /safe-area-inset-bottom/);
assert.match(css, /\.settings-dialog\{max-height:calc\(100vh - env\(safe-area-inset-top,0px\) - env\(safe-area-inset-bottom,0px\) - 24px\)\}/, "dialog height clears both device safe areas");
assert.match(css, /@supports\(height:100dvh\)\{\.settings-dialog\{max-height:calc\(100dvh - env\(safe-area-inset-top,0px\) - env\(safe-area-inset-bottom,0px\) - 24px\)\}\}/, "dialogs use the dynamic viewport height when available");
assert.match(css, /@media\(max-width:420px\)\{[\s\S]*?\.settings-dialog \.settings-foot\{flex-direction:column;align-items:stretch;gap:10px\}/, "dialog actions stack at narrow widths");
assert.match(css, /@media\(max-width:420px\)\{[\s\S]*?\.setting-choice\{align-items:stretch;flex-direction:column;gap:5px\}/, "preference labels stack above mobile selects");
assert.match(css, /\.setting-choice select\{width:100%;max-width:none;min-height:40px\}/, "mobile preference selects use the full dialog width");
assert.match(css, /\.clear-local-data-actions\{display:grid;grid-template-columns:1fr\}[\s\S]*?\.clear-local-data-actions \.button\{width:100%;min-height:40px\}/, "destructive confirmation actions stack and remain easy to tap");
assert.match(css, /\.settings-dialog \.settings-foot \.button\{min-height:40px\}/, "mobile dialog actions have larger touch targets");
assert.match(css, /\.toast\{[^}]*bottom:calc\(24px \+ env\(safe-area-inset-bottom,0px\)\)/, "toasts clear the device bottom inset");
assert.match(mobileRules, /\.toast\{left:50%;bottom:calc\(78px \+ env\(safe-area-inset-bottom,0px\)\)\}/);
assert.match(mobileRules, /\.adigun-window\.minimized\{top:auto;bottom:calc\(18px \+ env\(safe-area-inset-bottom,0px\)\)/);
assert.match(mobileRules, /\.workspace\.mode-no-document-title \.mobile-menu-button\{color:#fff\}/);
assert.match(mobileRules, /@media\(max-width:420px\)\{[\s\S]*?\.document-title\{width:min\(110px,28vw\)/);
assert.match(mobileRules, /\.icon-button\{width:26px\}/);
assert.match(mobileRules, /\.mobile-menu-button\{width:44px;height:44px\}/, "mobile navigation button meets the 44-pixel touch target");
assert.match(mobileRules, /\.ribbon-tools\{height:62px\}/, "mobile ribbon has room for full-size controls");
assert.match(mobileRules, /\.tool-button\{min-width:44px\}/, "mobile ribbon buttons meet the touch target width");
assert.match(mobileRules, /\.tool-button,\.tool-select\{height:44px\}/, "mobile ribbon controls meet the touch target height");

const braceDelta = [...css].reduce((count, character) => count + (character === "{" ? 1 : character === "}" ? -1 : 0), 0);
assert.equal(braceDelta, 0, "stylesheet braces remain balanced");
process.stdout.write("Mobile header tests passed: product identity and editor actions fit the compact header rules.\n");


