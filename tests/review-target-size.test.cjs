const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const targetRule = css.match(/\.review-filters button,\.review-comment-link,\.review-comment-resolve,\.tracked-revision-actions button\{([^}]+)\}/);
assert.ok(targetRule, "review actions and filters share a minimum target size rule");
assert.match(targetRule[1], /min-width:24px/);
assert.match(targetRule[1], /min-height:24px/);
process.stdout.write("Review target-size tests passed: comment, filter, and revision controls meet 24px minimum dimensions.\n");
