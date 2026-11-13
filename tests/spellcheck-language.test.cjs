const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

assert.match(html, /<select id="spellcheck-language">[\s\S]*?value="en-US"[\s\S]*?value="de-DE"[\s\S]*?value="fr-FR"[\s\S]*?value="es-ES"/);
assert.match(html, /Available dictionaries depend on your browser/);
assert.match(html, /id="spellcheck-language-indicator"/);
assert.match(app, /editor\.lang = spellcheckLanguage/);
assert.match(app, /localStorage\.setItem\("adigun-spellcheck-language", spellcheckLanguage\)/);
assert.match(app, /spellcheck-language"\)\.addEventListener\("change"/);
assert.match(app, /spellcheck-language-indicator"\)\.addEventListener\("click"/);
assert.match(app, /function openSettings\\(activeItem\\) \\{/);
assert.match(app, /else if \\(button\\.dataset\\.view === "settings"\\) openSettings\\(button\\);/);
assert.match(app, /spellcheck-language-indicator"\\)\\.addEventListener\\("click", \\(\\) => openSettings\\(\\)\\)/);
assert.doesNotMatch(app, /spellcheck-language-indicator[\\s\\S]{0,180}document\\.querySelector/);
process.stdout.write("Spellcheck language settings tests passed.\\n");
