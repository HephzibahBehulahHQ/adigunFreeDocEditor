const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const mediaStart = css.indexOf("@media(min-width:701px) and (max-width:900px){");
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
assert.match(tablet, /\.sidebar\{[^}]*height:54px/);
assert.match(tablet, /\.mobile-menu-button\{display:grid\}/);
assert.match(tablet, /\.sidebar:not\(\.mobile-open\) \.nav-item\{display:none!important\}/);
assert.match(tablet, /\.sidebar\.mobile-open \.nav-item\{display:flex!important/);
assert.match(tablet, /\.ribbon-tabs\{[^}]*overflow-x:auto/);
assert.match(tablet, /\.ribbon-tools\{height:52px/);
assert.match(tablet, /\.tool-button\{height:28px/);

const braceDelta = [...css].reduce((count, character) => count + (character === "{" ? 1 : character === "}" ? -1 : 0), 0);
assert.equal(braceDelta, 0, "stylesheet braces remain balanced");
process.stdout.write("Tablet layout tests passed: collapsible navigation and compact, scrollable ribbons are declared for 701–900px.\n");

