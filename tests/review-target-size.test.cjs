const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const targetRule = css.match(/\.review-filters button,\.review-comment-link,\.review-comment-resolve,\.tracked-revision-actions button\{([^}]+)\}/);
assert.ok(targetRule, "review actions and filters share a minimum target size rule");
assert.match(targetRule[1], /min-width:24px/);
assert.match(targetRule[1], /min-height:24px/);
assert.match(css, /@media\(max-width:1050px\)\{\.review-filters button,\.review-comment-link,\.review-comment-resolve,\.tracked-revision-actions button\{min-height:44px;display:inline-flex;align-items:center;justify-content:center\}\}/, "review actions have 44-pixel touch targets on tablet and phone layouts");
process.stdout.write("Review target-size tests passed: touch layouts use 44px controls, with the 24px desktop minimum retained.\n");
