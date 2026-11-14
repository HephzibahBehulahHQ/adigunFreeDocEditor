const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const reviewStart = source.indexOf("  function showReviewPanel(");
const reviewEnd = source.indexOf("  function trackedRevisionNodes(", reviewStart);
const assistantStart = source.indexOf("  function toggleAssistant(");
const assistantEnd = source.indexOf("  function buildOverview(", assistantStart);
assert.ok(reviewStart >= 0 && reviewEnd > reviewStart);
assert.ok(assistantStart >= 0 && assistantEnd > assistantStart);
assert.match(css, /@media\(max-width:1050px\)\{\.editor-layout\.has-outline\{grid-template-columns:minmax\(0,1fr\)\}/);
assert.match(css, /\.document-outline\.visible:not\(\.mobile-open\)\{display:none\}/);
assert.match(css, /\.document-outline\.visible\.mobile-open\{display:block;position:static;grid-column:1\}/);
assert.match(css, /\.outline-toggle:not\(\[hidden\]\)\{display:inline-flex\}/);

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

function element() {
  return { classList: new Classes(), attributes: {}, hidden: false, setAttribute(name, value) { this.attributes[name] = value; } };
}

const nodes = {
  "#review-comments": element(),
  "#editor-layout": element(),
  "#document-outline": element(),
  "#toggle-outline": element(),
  "#assistant-launcher": element(),
  "#assist-button": element(),
  ".app-shell": element(),
};
const assistantResizeHandle = { addEventListener() {}, setAttribute() {}, setPointerCapture() {} };
nodes["#review-comments"].hidden = true;
const assistant = element();
const window = { innerWidth: 1000, matchMedia(query) { const maximum = Number(query.match(/[0-9]+/)?.[0]); return { matches: this.innerWidth <= maximum }; }, addEventListener() {} };
const appShell = nodes[".app-shell"];
const api = new Function("window", "$", "assistant", "appShell", "assistantResizeHandle", "renderReviewComments", [
  source.slice(reviewStart, reviewEnd),
  source.slice(assistantStart, assistantEnd),
  "return { showReviewPanel, showOutlinePanel, toggleAssistant };",
].join("\n"))(
  window,
  (selector) => selector === "#assistant-dock-resize" ? assistantResizeHandle : nodes[selector],
  assistant,
  appShell,
  assistantResizeHandle,
  () => {},
);

api.showReviewPanel(true);
assert.equal(nodes["#review-comments"].hidden, false, "opening Review displays the review panel");
assert.equal(assistant.classList.contains("hidden"), true, "opening Review closes Adigun on compact layouts");
assert.equal(nodes["#assist-button"].attributes["aria-expanded"], "false", "closing Adigun updates the remaining workspace toggle");

api.toggleAssistant(true);
assert.equal(nodes["#review-comments"].hidden, true, "opening Adigun closes Review on compact layouts");
assert.equal(assistant.classList.contains("hidden"), false, "Adigun opens after Review closes");
assert.equal(appShell.classList.contains("assistant-docked"), false, "compact layouts keep Adigun in the floating panel layout");

api.showOutlinePanel(true);
assert.equal(nodes["#document-outline"].classList.contains("mobile-open"), true, "opening Outline displays it");
assert.equal(assistant.classList.contains("hidden"), true, "opening Outline closes Adigun on compact layouts");

api.toggleAssistant(true);
assert.equal(nodes["#document-outline"].classList.contains("mobile-open"), false, "opening Adigun closes Outline on compact layouts");
assert.equal(nodes["#toggle-outline"].attributes["aria-expanded"], "false");

process.stdout.write("Responsive panel tests passed: Review, Outline, and Adigun remain exclusive on compact layouts.\n");


