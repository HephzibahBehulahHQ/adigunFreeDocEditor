const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const tablist = html.match(/<nav class="ribbon-tabs" role="tablist"[\s\S]*?<\/nav>/)?.[0] ?? "";
assert.equal((tablist.match(/role="tab"/g) ?? []).length, 5, "the ribbon exposes five tabs");
assert.match(css, /@media\(max-width:700px\)\{\.ribbon-tabs\{height:44px\}\}/, "mobile ribbon tabs meet the 44-pixel touch target");
assert.match(tablist, /id="ribbon-tab-home" role="tab" aria-selected="true"[^>]*tabindex="0"/);
assert.equal((tablist.match(/aria-selected="false"[^>]*tabindex="-1"/g) ?? []).length, 4, "inactive tabs are removed from sequential focus");
assert.match(html, /id="ribbon-tools" role="tabpanel" aria-labelledby="ribbon-tab-home"/);
assert.match(app, /function activateRibbonTab\(tab\)[\s\S]*?setAttribute\("aria-selected", String\(selected\)\)[\s\S]*?setAttribute\("aria-labelledby", tab\.id\)/);
assert.match(app, /event\.key === "ArrowRight"[\s\S]*?event\.key === "ArrowLeft"[\s\S]*?event\.key === "Home"[\s\S]*?event\.key === "End"/);
assert.match(app, /tabs\[nextIndex\]\.focus\(\);\s*activateRibbonTab\(tabs\[nextIndex\]\)/);
process.stdout.write("Ribbon tab tests passed: selection, panel labeling, and keyboard navigation are wired.\n");
