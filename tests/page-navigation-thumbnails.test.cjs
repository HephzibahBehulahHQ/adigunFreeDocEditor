const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const navigationStart = app.indexOf("  function renderPageNavigation()");
const navigationEnd = app.indexOf("  function scheduleEditorPagination()", navigationStart);

assert.ok(navigationStart >= 0 && navigationEnd > navigationStart);
const navigationSource = app.slice(navigationStart, navigationEnd);
assert.match(navigationSource, /className = "page-thumbnail-preview"/);
assert.match(navigationSource, /updateCurrentPageNavigation\(\)/);
assert.match(navigationSource, /button\.setAttribute\("aria-current", "page"\)/);
assert.match(navigationSource, /window\.addEventListener\("scroll", scheduleCurrentPageNavigation, \{ passive: true \}\)/);
assert.match(styles, /\.break-navigation-item\.page-thumbnail-item\{display:grid;grid-template-columns:68px minmax\(0,1fr\)/);
assert.match(styles, /\.page-thumbnail-preview\{position:relative;display:block;width:68px;height:92px;overflow:hidden/);
assert.match(styles, /\.page-thumbnail-item\.active \.page-thumbnail-preview\{border-color:var\(--purple\)/);

process.stdout.write("Page navigation thumbnail tests passed: previews are bounded and the visible page is announced.\n");
