const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const selectedStart = source.indexOf("  function selectedParagraphBlocks()");
const setterEnd = source.indexOf("  function applyParagraphIndent(", selectedStart);
assert.ok(selectedStart >= 0 && setterEnd > selectedStart);

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
  contains: (node) => node === textNode || node === block,
  querySelectorAll: () => [block],
  focus() {},
};
let saved = 0;
let counted = 0;
const range = { collapsed: true, startContainer: textNode, endContainer: textNode, cloneRange() { return this; } };
const selection = {
  rangeCount: 1, anchorNode: textNode, focusNode: textNode,
  getRangeAt: () => range,
  removeAllRanges() { this.rangeCount = 0; },
  addRange(value) { this.rangeCount = 1; this.anchorNode = value.startContainer; this.focusNode = value.endContainer; },
};
const ruler = { disabled: false, value: "0", dataset: {}, setAttribute(name, value) { this[name] = value; } };
const output = { textContent: "" };
const api = new Function("window", "Node", "editor", "notify", "$", "updateRibbonSelection", "countWords", "saveDocument", "paragraphRulerBlocks", "paragraphRulerRange",
  source.slice(selectedStart, setterEnd) + "\nreturn { selectedParagraphBlocks, setParagraphIndent, updateParagraphRuler };")(
    { getSelection: () => selection }, Node, editor, () => {},
    (selector) => selector === "#paragraph-indent-ruler" ? ruler : output,
    () => {}, () => counted++, () => saved++, [], null
  );

api.updateParagraphRuler();
assert.equal(ruler.disabled, false);
selection.rangeCount = 0;
selection.anchorNode = null;
selection.focusNode = null;
api.updateParagraphRuler();
assert.equal(ruler.disabled, false, "ruler retains its paragraph target while focused");
api.setParagraphIndent(1);
assert.equal(block.getAttribute("data-indent-level"), "1");
assert.equal(block.style.marginLeft, "36pt");
assert.equal(selection.rangeCount, 1, "ruler action restores the editor selection");
assert.equal(ruler.value, "1");
api.setParagraphIndent(0);
assert.equal(block.getAttribute("data-indent-level"), null);
assert.equal(block.style.marginLeft, "");
assert.equal(saved, 2);
assert.equal(counted, 2);
process.stdout.write("Document ruler tests passed: ruler focus preserves selection, updates indentation, and resets correctly.\n");
