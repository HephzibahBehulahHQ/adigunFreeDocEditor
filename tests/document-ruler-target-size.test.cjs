const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const ruler = css.match(/#paragraph-indent-ruler\{([^}]+)\}/)?.[1];
assert.ok(ruler, "paragraph indent ruler has a declared style");
assert.match(ruler, /height:24px/, "slider hit area is at least 24px high");
assert.match(ruler, /#bbc4d2 11px 12px/, "ruler track is centered in the larger hit area");
assert.match(css, /@media\(max-width:700px\)\{[\s\S]*?#paragraph-indent-ruler\{height:44px;background:linear-gradient\(to bottom,transparent 0 21px,#bbc4d2 21px 22px,transparent 22px\)/, "mobile ruler uses a 44px touch target with a centered track");
process.stdout.write("Document ruler target-size tests passed: the ruler track is centered and the mobile hit area is 44px.\n");
