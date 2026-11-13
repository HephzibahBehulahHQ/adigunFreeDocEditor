const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const ruler = css.match(/#paragraph-indent-ruler\{([^}]+)\}/)?.[1];
assert.ok(ruler, "paragraph indent ruler has a declared style");
assert.match(ruler, /height:24px/, "slider hit area is at least 24px high");
assert.match(ruler, /#bbc4d2 11px 12px/, "ruler track is centered in the larger hit area");
process.stdout.write("Document ruler target-size tests passed: the 24px slider has a centered track.\n");
