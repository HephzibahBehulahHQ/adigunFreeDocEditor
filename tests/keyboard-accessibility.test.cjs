const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const shortcutSource = app.match(/function handleKeyboardShortcut\(event\) \{[\s\S]*?\n  \}/)?.[0];

assert.match(html, /<a class="skip-link" href="#workspace">Skip to editor workspace<\/a>/);
assert.match(html, /<section class="workspace" id="workspace" tabindex="-1">/);
assert.ok(html.indexOf('class="skip-link"') < html.indexOf('id="workspace-nav"'), "skip link precedes workspace navigation");
assert.match(css, /:root\{--focus-ring:#5635b8\}/);
assert.match(css, /\[data-theme="dark"\]\{--focus-ring:#c4b5fd\}/);
assert.match(css, /:focus-visible\{outline:3px solid var\(--focus-ring\);outline-offset:2px\}/);
assert.match(css, /\.document-title:focus-visible/);
assert.match(css, /\.document-page:focus-visible/);
assert.match(css, /\.skip-link:focus-visible\{transform:translateY\(0\)\}/);
assert.ok(shortcutSource, "workspace keyboard shortcuts have a single handler");
assert.match(app, /function openFindDialog\(focusReplacement = false\)/);
assert.match(app, /if \(!dialog\.open\) dialog\.showModal\(\)/, "shortcut use can refocus an already-open find dialog safely");

const shortcutCalls = [];
const nodes = { "#workspace-nav": { classList: { contains: () => false } }, "#mobile-menu": { focus() {} } };
const shortcutFactory = new Function("$", "setMobileMenu", "saveDocument", "notify", "openFindDialog", `${shortcutSource}; return handleKeyboardShortcut;`);
const handleShortcut = shortcutFactory((selector) => nodes[selector], () => {}, () => shortcutCalls.push("save"), () => {}, (replace) => shortcutCalls.push(replace ? "replace" : "find"));
function shortcutEvent(key, { ctrlKey = false, metaKey = false, altKey = false } = {}) {
  return { key, ctrlKey, metaKey, altKey, prevented: false, preventDefault() { this.prevented = true; } };
}
const findEvent = shortcutEvent("f", { ctrlKey: true });
handleShortcut(findEvent);
assert.equal(findEvent.prevented, true);
assert.deepEqual(shortcutCalls, ["find"]);
const replaceEvent = shortcutEvent("h", { metaKey: true });
handleShortcut(replaceEvent);
assert.equal(replaceEvent.prevented, true);
assert.deepEqual(shortcutCalls, ["find", "replace"]);
const plainEvent = shortcutEvent("f");
handleShortcut(plainEvent);
assert.equal(plainEvent.prevented, false);
assert.deepEqual(shortcutCalls, ["find", "replace"]);
const saveEvent = shortcutEvent("s", { ctrlKey: true });
handleShortcut(saveEvent);
assert.equal(saveEvent.prevented, true);
assert.deepEqual(shortcutCalls, ["find", "replace", "save"]);

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((channel) => parseInt(channel, 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

for (const [ring, surface] of [["#5635b8", "#ffffff"], ["#5635b8", "#f3f5f9"], ["#c4b5fd", "#101827"]]) {
  assert.ok(contrast(ring, surface) >= 3, ring + " focus ring has 3:1 contrast against " + surface);
}

const braceDelta = [...css].reduce((count, character) => count + (character === "{" ? 1 : character === "}" ? -1 : 0), 0);
assert.equal(braceDelta, 0, "stylesheet braces remain balanced");
process.stdout.write("Keyboard accessibility tests passed: skip target, visible high-contrast focus, and document shortcuts are available.\n");
