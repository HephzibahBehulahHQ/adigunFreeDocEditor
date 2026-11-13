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
api.updateParagraphRuler();
assert.equal(block.getAttribute("data-indent-level"), "1");
assert.equal(block.style.marginLeft, "36pt");
assert.equal(selection.rangeCount, 1, "ruler action restores the editor selection");
assert.equal(ruler.value, "1");
api.setParagraphIndent(0);
api.updateParagraphRuler();
assert.equal(block.getAttribute("data-indent-level"), null);
assert.equal(block.style.marginLeft, "");
assert.equal(saved, 2);
assert.equal(counted, 2);

const paginationStart = source.indexOf("  function paginateEditor()");
const paginationEnd = source.indexOf("  function normalizeReviewComments(", paginationStart);
assert.ok(paginationStart >= 0 && paginationEnd > paginationStart);
const paginationSource = source.slice(paginationStart, paginationEnd);
const captureCall = paginationSource.indexOf("const savedSelection = captureEditorSelection();");
const moveCall = paginationSource.indexOf("items.forEach((node) => sheet.append(node));");
const replaceCall = paginationSource.indexOf("editor.replaceChildren(fragment);");
const restoreCall = paginationSource.indexOf("restoreEditorSelection(savedSelection);");
assert.ok(captureCall >= 0 && captureCall < moveCall && moveCall < replaceCall && replaceCall < restoreCall, "pagination captures selection before moving nodes and restores it after reflow");

const anchorNode = {};
const focusNode = {};
const outsideNode = {};
const selectionState = {
  rangeCount: 1,
  anchorNode,
  anchorOffset: 3,
  focusNode,
  focusOffset: 2,
  setBaseAndExtent(...points) { this.restoredPoints = points; },
};
const selectionEditor = {
  focusCalls: 0,
  focus() { this.focusCalls++; },
  contains: (node) => node === anchorNode || node === focusNode,
};
const activeDocument = { activeElement: selectionEditor };
const editorOffset = (node, offset) => node === anchorNode ? 10 + offset : node === focusNode ? offset : -1;
const rangeAtTextOffsets = (start, end) => ({
  startContainer: focusNode, startOffset: start,
  endContainer: anchorNode, endOffset: end - 10,
});
const selectionApi = new Function("window", "document", "editor", "editorOffset", "rangeAtTextOffsets",
  source.slice(source.indexOf("  function captureEditorSelection()"), source.indexOf("  function normalizeReviewComments(")) +
  "return { captureEditorSelection, restoreEditorSelection };")(
  { getSelection: () => selectionState },
  activeDocument,
  selectionEditor,
  editorOffset,
  rangeAtTextOffsets
);
const savedSelection = selectionApi.captureEditorSelection();
assert.equal(savedSelection.anchorTextOffset, 13);
assert.equal(savedSelection.focusTextOffset, 2);
assert.equal(savedSelection.focused, true);
assert.equal(selectionApi.restoreEditorSelection(savedSelection), true);
assert.equal(selectionEditor.focusCalls, 1, "focused editor is refocused before restoring its selection");
assert.deepEqual(selectionState.restoredPoints, [anchorNode, 3, focusNode, 2], "backward selection direction is preserved");
activeDocument.activeElement = outsideNode;
const unfocusedBookmark = selectionApi.captureEditorSelection();
assert.equal(unfocusedBookmark.focused, false);
selectionApi.restoreEditorSelection(unfocusedBookmark);
assert.equal(selectionEditor.focusCalls, 1, "restoration does not steal focus from another control");
selectionState.anchorNode = outsideNode;
selectionState.focusNode = outsideNode;
assert.equal(selectionApi.captureEditorSelection(), null, "selection outside the editor is ignored");
assert.equal(selectionApi.restoreEditorSelection({ anchorNode: outsideNode, focusNode: outsideNode, anchorOffset: 0, focusOffset: 0, anchorTextOffset: -1, focusTextOffset: -1 }), false);

process.stdout.write("Document ruler tests passed: ruler focus preserves selection, updates indentation, and resets correctly.\n");
