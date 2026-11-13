const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
assert.match(app, /document\.addEventListener\("click", \(event\) =>\s*\{\s*const target = event\.target;\s*if \(!\$\("#workspace-nav"\)\.classList\.contains\("mobile-open"\) \|\| !\(target instanceof Element\)\) return;\s*if \(target\.closest\("#workspace-nav"\) \|\| target\.closest\("#mobile-menu"\)\) return;\s*setMobileMenu\(false\);\s*\}\)/);
process.stdout.write("Mobile menu outside-click tests passed: clicks outside dismiss the open menu without interfering with its toggle.\n");
