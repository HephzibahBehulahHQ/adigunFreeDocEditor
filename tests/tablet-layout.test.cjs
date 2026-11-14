const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const mediaStart = css.indexOf("@media(min-width:701px) and (max-width:1050px){\n  .app-shell{display:block}");
assert.ok(mediaStart >= 0, "tablet layout breakpoint exists");

let depth = 0;
let mediaEnd = -1;
for (let index = css.indexOf("{", mediaStart); index < css.length; index += 1) {
  if (css[index] === "{") depth += 1;
  if (css[index] === "}" && --depth === 0) { mediaEnd = index; break; }
}
assert.ok(mediaEnd > mediaStart, "tablet media block is balanced");
const tablet = css.slice(mediaStart, mediaEnd + 1);

assert.match(html, /id="mobile-menu"[^>]*aria-controls="workspace-nav"/);
assert.match(tablet, /\.app-shell\{display:block\}/);
assert.match(tablet, /\.sidebar\{[^}]*height:calc\(54px \+ env\(safe-area-inset-top,0px\)\)/);
assert.match(tablet, /env\(safe-area-inset-bottom,0px\)/);
assert.match(tablet, /\.mobile-menu-button\{display:grid\}/);
const tabletLandingRule = css.split("\n").find((line) => line.startsWith("@media(min-width:701px) and (max-width:1050px){.workspace.mode-no-document-title .topbar{"));
assert.ok(tabletLandingRule?.includes(".workspace.mode-no-document-title .topbar{height:0;padding:0;border:0;overflow:visible}"), "tablet landing removes its empty topbar row");
assert.ok(tabletLandingRule?.includes(".workspace.mode-no-document-title .topbar-actions{position:fixed;"), "tablet landing keeps the menu in the top row");
assert.ok(tabletLandingRule?.includes(".workspace.mode-no-document-title .mobile-menu-button{color:#fff;width:44px;height:44px}"), "tablet landing keeps its menu visible and tappable");
assert.match(css, /@media\(min-width:1051px\)\{\.workspace\.mode-no-document-title \.topbar\{display:none\}\}/, "desktop landing hides the document toolbar");
assert.match(tablet, /\.sidebar:not\(\.mobile-open\) \.nav-item\{display:none!important\}/);
assert.match(tablet, /\.sidebar\.mobile-open \.nav-item\{display:flex!important/);
assert.match(css, /@media\\(max-width:1050px\\)\\{\\.sidebar\\.mobile-open \\.nav-item\\{min-height:44px\\}\\}/, "open tablet and phone navigation links have 44-pixel touch targets");
assert.match(tablet, /\.ribbon-tabs\{[^}]*overflow-x:auto/);
assert.match(tablet, /\.ribbon-tools\{height:58px/);
assert.match(tablet, /\.tool-button\{height:36px;min-width:36px/);
assert.match(tablet, /\.tool-select\{height:36px/);

const braceDelta = [...css].reduce((count, character) => count + (character === "{" ? 1 : character === "}" ? -1 : 0), 0);
assert.equal(braceDelta, 0, "stylesheet braces remain balanced");
process.stdout.write("Tablet layout tests passed: collapsible navigation and compact, scrollable ribbons are declared for 701–1050px.\n");

