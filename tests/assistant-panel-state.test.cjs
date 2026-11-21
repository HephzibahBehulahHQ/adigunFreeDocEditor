const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
assert.match(html, /id="assist-button"[^>]*aria-controls="adigun-window"[^>]*aria-expanded="false"[^>]*aria-label="Toggle Adigun assistant"/);
assert.match(html, /class="adigun-window hidden" id="adigun-window"[^>]*aria-hidden="true"/);
assert.doesNotMatch(html, /assistant-launcher/, "one workspace toggle avoids a duplicate floating launcher");
assert.match(app, /assistant\.classList\.toggle\("hidden", !open\)[\s\S]*?assistant\.setAttribute\("aria-hidden", String\(!open\)\)[\s\S]*?\$\("#assist-button"\)\.setAttribute\("aria-expanded", String\(open\)\)/);
assert.match(app, /\$\("#assist-button"\)\.addEventListener\("click", \(\) => toggleAssistant\(\)\)/);
assert.doesNotMatch(app, /assistant-launcher/);
assert.doesNotMatch(css, /\.assistant-launcher/);
assert.doesNotMatch(app, /maybeAutoOpenAssistantForDocument/, "editable documents leave the assistant closed until requested");
assert.match(app, /\$\("#close-adigun"\)\.addEventListener\("click", \(\) => toggleAssistant\(false\)\)/);
process.stdout.write("Assistant panel tests passed: the local tools rail can be opened and closed on demand.\n");
