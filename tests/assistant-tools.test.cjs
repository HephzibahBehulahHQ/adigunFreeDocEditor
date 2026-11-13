const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const markup = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const start = source.indexOf("  function toggleAssistant(");
const end = source.indexOf("  function buildOverview(", start);
assert.ok(start >= 0 && end > start);
assert.match(markup, /id="assistant-find"[^>]*>.*?Find and replace/s);
assert.match(markup, /id="assistant-review"[^>]*>.*?Comments and changes/s);
assert.match(markup, /No AI provider is connected\./);
assert.match(styles, /\.adigun-body\{flex:1;min-height:0;overflow:auto\}/);
assert.match(styles, /\.assistant-quick-tools h3\{[^}]*font-size:13px/);
assert.match(styles, /\.assistant-tool strong\{font-size:12px/);
assert.match(styles, /\.assistant-tool small\{color:var\(--muted\);font-size:11px/);

class Classes {
  values = new Set();
  contains(name) { return this.values.has(name); }
  toggle(name, force) {
    const next = force === undefined ? !this.contains(name) : Boolean(force);
    if (next) this.values.add(name);
    else this.values.delete(name);
    return next;
  }
  remove(name) { this.values.delete(name); }
}

const assistant = { classList: new Classes(), attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
const assistButton = { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
const appShell = { classList: new Classes() };
const assistantResizeHandle = { addEventListener() {}, setAttribute() {}, setPointerCapture() {} };
const editor = { contentEditable: "false" };
const notices = [];
let findOpenedWhileAssistantHidden = false;
let reviewOpened = false;
let ribbonRenders = 0;
const script = `let activeTab = "home";\n${source.slice(start, end)}\nreturn { useAssistantFind, useAssistantReview, getActiveTab: () => activeTab };`;
const api = new Function("window", "$", "assistant", "appShell", "assistantResizeHandle", "editor", "activePdfFile", "openFindDialog", "renderRibbon", "showReviewPanel", "notify", script)(
  { matchMedia: (query) => ({ matches: query === "(max-width: 900px)" }), addEventListener() {} },
  (selector) => selector === "#assist-button" ? assistButton : selector === "#assistant-dock-resize" ? assistantResizeHandle : appShell,
  assistant,
  appShell,
  assistantResizeHandle,
  editor,
  undefined,
  () => { findOpenedWhileAssistantHidden = assistant.classList.contains("hidden"); },
  () => { ribbonRenders += 1; },
  (open) => { reviewOpened = open; },
  (message) => notices.push(message),
);

api.useAssistantReview();
assert.equal(reviewOpened, false, "Review does not open without an editable document");
assert.match(notices[0], /editable document/);

editor.contentEditable = "true";
api.useAssistantReview();
assert.equal(api.getActiveTab(), "review", "the Review ribbon is selected");
assert.equal(reviewOpened, true, "the Review panel opens");
assert.equal(ribbonRenders, 1);

assistant.classList.remove("hidden");
api.useAssistantFind();
assert.equal(assistant.classList.contains("hidden"), true, "Find closes Adigun on compact layouts");
assert.equal(assistButton.attributes["aria-expanded"], "false", "the workspace toggle remains available and announces the collapsed state");
assert.equal(findOpenedWhileAssistantHidden, true, "Find opens after Adigun closes");
assert.equal(appShell.classList.contains("assistant-docked"), false, "the panel does not dock in the compact layout");

process.stdout.write("Assistant tool tests passed: Find and Review route to existing editor tools without implying hosted AI.\n");


