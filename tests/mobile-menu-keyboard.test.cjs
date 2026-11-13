const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.match(html, /id="mobile-menu"[^>]*aria-controls="workspace-nav"[^>]*aria-expanded="false"/);
assert.match(app, /if \(event\.key === "Escape" && \$\("#workspace-nav"\)\.classList\.contains\("mobile-open"\)\)\s*\{\s*setMobileMenu\(false\);\s*\$\("#mobile-menu"\)\.focus\(\);\s*return;/);
assert.match(app, /function setMobileMenu\(open\)[\s\S]*?nav\.classList\.toggle\("mobile-open", open\)[\s\S]*?setAttribute\("aria-expanded", String\(open\)\)/);
assert.match(html, /id="close-workspace-menu"[^>]*aria-label="Close workspace menu"/);
assert.match(app, /close-workspace-menu[\s\S]*?setMobileMenu\(false\);[\s\S]*?mobile-menu[\s\S]*?focus\(\)/);
process.stdout.write("Mobile menu keyboard tests passed: Escape closes the menu and returns focus to its toggle.\n");
