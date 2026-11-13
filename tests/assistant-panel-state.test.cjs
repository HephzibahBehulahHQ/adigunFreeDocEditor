const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
assert.match(html, /id="assist-button"[^>]*aria-controls="adigun-window"[^>]*aria-expanded="false"[^>]*aria-label="Toggle Adigun assistant"/);
assert.match(html, /class="adigun-window hidden" id="adigun-window"[^>]*aria-hidden="true"/);
assert.match(html, /class="assistant-launcher visible" id="assistant-launcher"/);
assert.match(app, /assistant\.classList\.toggle\("hidden", !open\)[\s\S]*?assistant\.setAttribute\("aria-hidden", String\(!open\)\)[\s\S]*?\$\("#assist-button"\)\.setAttribute\("aria-expanded", String\(open\)\)/);
assert.match(app, /\$\("#assist-button"\)\.addEventListener\("click", \(\) => toggleAssistant\(\)\)/);
process.stdout.write("Assistant panel tests passed: it starts collapsed and the workspace toggle announces its state.\n");
