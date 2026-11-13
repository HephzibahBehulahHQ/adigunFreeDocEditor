const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const modes = app.match(/classList\.toggle\("mode-no-document-title", \[([^\]]+)\]\.includes\(mode\)\)/);

assert.ok(modes, "workspace modes control document-only title and save chrome");
assert.deepEqual(
  [...modes[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]),
  ["landing", "list", "conversion"],
  "only views without an open document hide the document title and save state",
);
assert.match(
  styles,
  /\.workspace\.mode-no-document-title #document-title,\.workspace\.mode-no-document-title #save-state\{display:none\}/,
  "the no-document mode hides both document-only controls",
);
process.stdout.write("Workspace chrome tests passed: document title and save state match the active view.\n");
