const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

assert.match(app, /go\.dataset\.revisionGo = revision\.dataset\.revisionId/, "each tracked change links to its source revision");
assert.match(app, /function goToTrackedRevision\(id\)[\s\S]*?scrollIntoView\(/, "the review link scrolls to the corresponding change");
assert.match(app, /\[data-revision-go\][\s\S]*?goToTrackedRevision\(go\.dataset\.revisionGo\)/, "review link actions are connected to navigation");
assert.match(app, /prefers-reduced-motion: reduce/, "navigation respects reduced-motion preferences");
assert.match(styles, /\.review-location-highlight\{[^}]*outline:[^}]*\}/, "the source revision is briefly highlighted");
process.stdout.write("Review navigation tests passed: tracked changes link to highlighted document text.\n");
