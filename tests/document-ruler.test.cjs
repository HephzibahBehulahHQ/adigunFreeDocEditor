const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const selectedStart = source.indexOf("  function selectedParagraphBlocks()");
const selectedEnd = source.indexOf("  function setParagraphIndent(", selectedStart);
const setterEnd = source.indexOf("  function updateParagraphRuler(", selectedEnd);
assert.ok(selectedStart >= 0 && selectedEnd > selectedStart && setterEnd > selectedEnd);

const Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
const textNode = { nodeType: Node.TEXT_NODE };
const block = {
  attributes: {},
  style: {},
  contains: (node) => node === textNode,
  getAttribute(name) { return this.attributes[name] ?? null; },
  setAttribute(name, value) { this.attributes[name] = String(value); },
  removeAttribute(name) { delete this.attributes[name]; },
};
const editor = {
  contentEditable: "true",
  contains: (node) => node === textNode,
  querySelectorAll: () => [block],
  focus() {},
};
let saved = 0;
let counted = 0;
const range = { collapsed: true, cloneRange() { return this; } };
const selection = {
  rangeCount: 1, anchorNode: textNode, focusNode: textNode,
  getRangeAt: () => range, removeAllRanges() {}, addRange() {},
};
const api = new Function("window", "Node", "editor", "notify", "updateRibbonSelection", "countWords", "saveDocument",
  source.slice(selectedStart, selectedEnd) + "\n" + source.slice(selectedEnd, setterEnd) +
  "\nreturn { selectedParagraphBlocks, setParagraphIndent };")(
    { getSelection: () => selection }, Node, editor, () => {}, () => {}, () => counted++, () => saved++
  );

api.setParagraphIndent(3);
assert.equal(block.getAttribute("data-indent-level"), "3");
assert.equal(block.style.marginLeft, "108pt");
api.setParagraphIndent(0);
assert.equal(block.getAttribute("data-indent-level"), null);
assert.equal(block.style.marginLeft, "");
assert.equal(saved, 2);
assert.equal(counted, 2);
process.stdout.write("Document ruler tests passed: selected paragraph indentation updates and resets correctly.\n");
