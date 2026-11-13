const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
assert.match(html, /class="nav-item active" data-view="recent" aria-current="page"/);
assert.match(app, /function setActiveNavigationItem\(activeItem\)[\s\S]*?setAttribute\("aria-current", "page"\)[\s\S]*?removeAttribute\("aria-current"\)/);
assert.match(app, /setActiveNavigationItem\(button\)/, "navigation clicks update the announced current view");
assert.match(app, /setActiveNavigationItem\(document\.querySelector\("\.nav-item\[data-view=\\"recent\\"\]"\)\)/, "returning to Recent restores the current-view announcement");
process.stdout.write("Navigation accessibility tests passed: the active workspace view is announced.\n");
