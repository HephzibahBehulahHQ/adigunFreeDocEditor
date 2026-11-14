const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = source.indexOf("  function splitLongParagraph(paragraph, capacity)");
const end = source.indexOf("  function paginateEditor()", start);
assert.ok(start >= 0 && end > start);

const inserted = [];
const makeParagraph = (text, hasImage = false) => {
  const paragraph = {
    tagName: "P",
    textNodes: [{ nodeValue: text }],
    querySelector: () => hasImage ? {} : null,
    cloneNode: () => ({
      textContent: "",
      attributes: {},
      append(fragment) { this.textContent += fragment.textContent; },
      setAttribute(name, value) { this.attributes[name] = value; },
    }),
    replaceWith(...nodes) { inserted.push(...nodes); },
  };
  return paragraph;
};
const paragraphRange = (paragraph, _nodes, first, last) => {
  const selected = paragraph.textNodes.map((node) => node.nodeValue).join("").slice(first, last);
  return {
    getBoundingClientRect: () => ({ height: Math.max(16, Math.ceil(selected.length / 24) * 16) }),
    cloneContents: () => ({ textContent: selected }),
  };
};
const split = new Function("getComputedStyle", "paragraphTextNodes", "paragraphRange", "crypto",
  source.slice(start, end) + "\nreturn splitLongParagraph;")(
  () => ({ marginTop: "0", marginBottom: "0", paddingTop: "0", paddingBottom: "0", borderTopWidth: "0", borderBottomWidth: "0" }),
  (root) => root.textNodes,
  paragraphRange,
  { randomUUID: () => "f00d-1234" }
);

const text = "A long paragraph with several words that must be split across multiple pages.";
const paragraph = makeParagraph(text);
const fragments = split(paragraph, 32);
assert.ok(fragments.length > 1, "over-height paragraphs are split into page-sized fragments");
assert.equal(fragments.map((fragment) => fragment.textContent).join(""), text, "splitting preserves every character in order");
assert.ok(fragments.slice(0, -1).every((fragment) => /\s$/.test(fragment.textContent)), "paragraph fragments end at word boundaries");
assert.ok(fragments.every((fragment) => fragment.attributes["data-page-flow-id"] === "f00d-1234"), "fragments retain a shared serialization identity");
assert.deepEqual(inserted, fragments, "the paragraph is replaced by its visual fragments");
const unbroken = "🧪".repeat(30);
const unbrokenFragments = split(makeParagraph(unbroken), 32);
assert.ok(unbrokenFragments.length > 1, "an unbroken word can split when it exceeds the page width");
assert.equal(unbrokenFragments.map((fragment) => fragment.textContent).join(""), unbroken, "code point fallback preserves supplementary Unicode characters");
assert.deepEqual(split(makeParagraph(text, true), 32).map((fragment) => fragment.tagName || "P"), ["P"], "paragraphs containing images are left intact");
console.log("Document pagination checks passed");
