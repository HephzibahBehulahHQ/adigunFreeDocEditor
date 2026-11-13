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
assert.match(app, /\$\("#assist-button"\)\.addEventListener\("click", \(\) => toggleAssistant\(undefined, true\)\)/);
assert.doesNotMatch(app, /assistant-launcher/);
assert.doesNotMatch(css, /\.assistant-launcher/);
assert.ok(app.includes("maybeAutoOpenAssistantForDocument(isDocument)"));
assert.ok(app.includes("toggleAssistant(true, false)"));
assert.ok(app.includes("assistantManuallyControlled = true"));
assert.ok(app.includes("toggleAssistant(false, true)"));

const autoStart = app.indexOf("  function maybeAutoOpenAssistantForDocument(");
const autoEnd = app.indexOf("\n  function toggleAssistant(", autoStart);
const autoSource = app.slice(autoStart, autoEnd);
assert.ok(autoStart >= 0 && autoEnd > autoStart, "wide-screen panel behavior is isolated");
const calls = [];
const createAutoOpen = (wide, manuallyControlled) => new Function(
  "window", "assistantManuallyControlled", "toggleAssistant",
  autoSource + "\nreturn maybeAutoOpenAssistantForDocument;",
)(
  { matchMedia: (query) => ({ matches: wide && query === "(min-width: 1200px)" }) },
  manuallyControlled,
  (...args) => calls.push(args),
);
createAutoOpen(true, false)(false);
assert.equal(calls.length, 0, "landing and conversion modes keep the panel closed");
createAutoOpen(true, false)(true);
assert.deepEqual(calls, [[true, false]], "wide editable documents open the panel without recording a user preference");
calls.length = 0;
createAutoOpen(true, true)(true);
assert.equal(calls.length, 0, "a user who closes the panel keeps it closed on later documents");
createAutoOpen(false, false)(true);
assert.equal(calls.length, 0, "compact layouts keep the panel closed by default");

process.stdout.write("Assistant panel tests passed: the local tools rail opens for desktop documents and respects a manual close.\n");
