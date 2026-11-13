const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const appStart = html.indexOf('<main class="app-shell">');
const appEnd = html.indexOf("</main>", appStart);
assert.ok(appStart >= 0 && appEnd > appStart, "application shell is present");
assert.match(html.slice(appStart, appEnd), /<section class="adigun-window hidden" id="adigun-window"/);
assert.match(html, /id="assistant-dock-resize" role="separator" aria-orientation="vertical"[^>]*tabindex="0"/);
assert.doesNotMatch(html.slice(appEnd), /id="adigun-window"/, "the panel remains part of the app grid");
assert.match(source, /window\.matchMedia\("\(min-width: 1200px\)"\)/);
assert.match(source, /appShell\.classList\.toggle\("assistant-docked", docked\)/);
assert.match(source, /assistant\.classList\.toggle\("docked", docked\)/);
assert.match(source, /window\.addEventListener\("resize", updateAssistantLayout\)/);
assert.match(css, /@media\(min-width:1200px\)\{\.app-shell\.assistant-docked\{grid-template-columns:240px minmax\(0,1fr\) minmax\(260px,var\(--assistant-docked-width,310px\)\)\}/);
assert.match(css, /\.app-shell\.assistant-docked>\.adigun-window\{position:sticky;grid-column:3;grid-row:1/);
assert.match(css, /minmax\(260px,var\(--assistant-docked-width,310px\)\)/);
assert.match(css, /\.assistant-dock-resize::after/);
assert.ok(/assistantResizeStart\.width \+ assistantResizeStart\.x - event\.clientX/.test(source), "dragging left widens the panel");
assert.match(source, /assistantResizeHandle\.addEventListener\("keydown"/);
assert.match(source, /adigun-assistant-dock-width/);

const resizeStart = source.indexOf("  function updateAssistantLayout()");
const resizeEnd = source.indexOf("\n  function useAssistantFind()", resizeStart);
assert.ok(resizeStart >= 0 && resizeEnd > resizeStart, "resize behavior can be isolated for interaction checks");
class Classes {
  values = new Set();
  contains(name) { return this.values.has(name); }
  toggle(name, force) { if (force ?? !this.contains(name)) this.values.add(name); else this.values.delete(name); }
}
const events = {};
const attributes = {};
const cssVariables = {};
const stored = new Map();
const appShell = { classList: new Classes(), style: { setProperty(name, value) { cssVariables[name] = value; } } };
const assistant = { classList: new Classes() };
const assistantResizeHandle = {
  addEventListener(name, callback) { events[name] = callback; },
  setAttribute(name, value) { attributes[name] = value; },
  setPointerCapture() {},
};
const window = { innerWidth: 1280, matchMedia: () => ({ matches: true }), addEventListener() {} };
const localStorage = { setItem(key, value) { stored.set(key, value); } };
const resizeApi = new Function("window", "appShell", "assistant", "assistantResizeHandle", "localStorage", [
  "let assistantDockWidth = 310;",
  source.slice(resizeStart, resizeEnd),
  "return { updateAssistantLayout, setAssistantDockWidth };",
].join("\n"))(window, appShell, assistant, assistantResizeHandle, localStorage);
resizeApi.updateAssistantLayout();
assert.equal(cssVariables["--assistant-docked-width"], "310px");
let prevented = false;
events.keydown({ key: "ArrowLeft", shiftKey: false, preventDefault() { prevented = true; } });
assert.equal(attributes["aria-valuenow"], "322", "ArrowLeft widens the rail by one step");
assert.equal(prevented, true, "the resize key is handled by the separator");
events.pointerdown({ pointerId: 7, clientX: 1000, preventDefault() {}, });
events.pointermove({ pointerId: 7, clientX: 900 });
assert.equal(attributes["aria-valuenow"], "422", "dragging left widens the rail");
events.pointerup({ pointerId: 7 });
events.keydown({ key: "End", shiftKey: false, preventDefault() {} });
assert.equal(attributes["aria-valuenow"], "480", "End reaches the maximum rail width");
assert.equal(attributes["aria-valuemax"], "480");
assert.equal(stored.get("adigun-assistant-dock-width"), "480", "the width preference is persisted");

process.stdout.write("Assistant layout tests passed: the local tools dock at wide widths and remain in the responsive shell.\n");

