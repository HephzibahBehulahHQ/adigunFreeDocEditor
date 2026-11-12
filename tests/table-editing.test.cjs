const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const selectionStart = source.indexOf("  function selectedTableCell()");
const selectionEnd = source.indexOf("  function selectedParagraphBlocks()", selectionStart);
const operationStart = source.indexOf("  function mergeTableCells()", selectionEnd);
const operationEnd = source.indexOf("  function deleteTableRow()", operationStart);
assert.ok(selectionStart >= 0 && selectionEnd > selectionStart && operationStart > selectionEnd && operationEnd > operationStart);

const Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };

class Cell {
  constructor(tag = "td", attributes = {}, text = "") {
    this.nodeType = Node.ELEMENT_NODE;
    this.tagName = tag.toUpperCase();
    this.attributes = { ...attributes };
    this.childNodes = [];
    if (text) this.append({ nodeType: Node.TEXT_NODE, text, parentElement: this });
  }
  get parentElement() { return this._parentElement || null; }
  set parentElement(value) { this._parentElement = value; }
  get cells() { return this.childNodes; }
  get cellIndex() { return this.parentElement?.cells.indexOf(this) ?? -1; }
  get firstChild() { return this.childNodes[0] || null; }
  get rowSpan() { return Number(this.getAttribute("rowspan")) || 1; }
  append(node) {
    if (node.parentElement?.childNodes) {
      const siblings = node.parentElement.childNodes;
      const index = siblings.indexOf(node);
      if (index >= 0) siblings.splice(index, 1);
    }
    node.parentElement = this;
    this.childNodes.push(node);
  }
  closest(selector) {
    const tags = selector.split(",").map((tag) => tag.trim().toUpperCase());
    for (let node = this; node; node = node.parentElement) if (tags.includes(node.tagName)) return node;
    return null;
  }
  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? String(this.attributes[name]) : null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  removeAttribute(name) { delete this.attributes[name]; }
  remove() {
    const siblings = this.parentElement?.cells;
    const index = siblings?.indexOf(this) ?? -1;
    if (index >= 0) siblings.splice(index, 1);
    this.parentElement = null;
  }
  after(cell) {
    const siblings = this.parentElement.cells;
    const index = siblings.indexOf(this);
    siblings.splice(index + 1, 0, cell);
    cell.parentElement = this.parentElement;
  }
}

function createEnvironment(cells, { extraRows = [], selectionIndexes = [0, cells.length - 1], collapsed = false } = {}) {
  const editor = { tagName: "DIV", parentElement: null };
  const table = { tagName: "TABLE", parentElement: editor, closest(selector) { return selector === "table" ? this : null; } };
  const makeRow = (items) => {
    const row = { tagName: "TR", parentElement: table, cells: [] };
    for (const cell of items) { cell.parentElement = row; row.cells.push(cell); }
    return row;
  };
  const row = makeRow(cells);
  const rows = [row, ...extraRows.map(makeRow)];
  table.querySelectorAll = () => rows;
  const contains = (node) => {
    for (let current = node; current; current = current.parentElement) if (current === editor) return true;
    return false;
  };
  const selected = new Set();
  for (let index = selectionIndexes[0]; index <= selectionIndexes[1]; index++) if (cells[index]) selected.add(cells[index]);
  const textNode = (cell) => ({ nodeType: Node.TEXT_NODE, parentElement: cell });
  const selection = {
    rangeCount: 1,
    isCollapsed: collapsed,
    anchorNode: textNode(cells[selectionIndexes[0]]),
    focusNode: textNode(cells[selectionIndexes[1]]),
    getRangeAt() {
      return {
        startContainer: this.anchorNode,
        endContainer: this.focusNode,
        intersectsNode(node) { return selected.has(node); },
      };
    },
  };
  const notices = [];
  let focusedCell = null;
  const window = { getSelection: () => selection };
  const document = { createElement: (tag) => new Cell(tag) };
  const api = new Function("window", "Node", "editor", "document", "notify", "focusTableCell",
    source.slice(selectionStart, selectionEnd) + "\n" + source.slice(operationStart, operationEnd) +
    "\nreturn { selectedTableCell, selectedTableCells, mergeTableCells, splitTableCell };")(
      window, Node, { contains }, document, (message) => notices.push(message), (cell) => {
        focusedCell = cell;
        selection.anchorNode = cell;
        selection.focusNode = cell;
        selection.isCollapsed = true;
      });
  return { api, row, rows, selection, notices, get focusedCell() { return focusedCell; } };
}

{
  const first = new Cell("td", {}, "A");
  const middle = new Cell("td", {}, "B");
  const last = new Cell("td", {}, "C");
  const env = createEnvironment([first, middle, last]);
  assert.deepEqual(env.api.selectedTableCells(), [first, middle, last]);
  env.api.mergeTableCells();
  assert.equal(env.row.cells.length, 1);
  assert.equal(first.getAttribute("colspan"), "3");
  assert.deepEqual(first.childNodes.map((node) => node.text), ["A", "B", "C"]);
  assert.equal(env.focusedCell, first);
}

{
  const first = new Cell("td", {}, "A");
  const otherRowCell = new Cell("td", {}, "B");
  const env = createEnvironment([first], { extraRows: [[otherRowCell]], selectionIndexes: [0, 0] });
  env.selection.focusNode = { nodeType: Node.TEXT_NODE, parentElement: otherRowCell };
  assert.deepEqual(env.api.selectedTableCells(), []);
}

{
  const cell = new Cell("td", { colspan: 4, rowspan: 2 }, "Merged text");
  const env = createEnvironment([cell], { selectionIndexes: [0, 0], collapsed: true });
  env.api.splitTableCell();
  assert.equal(env.row.cells.length, 2);
  assert.equal(cell.getAttribute("colspan"), "2");
  assert.equal(env.row.cells[1].getAttribute("colspan"), "2");
  assert.equal(cell.getAttribute("rowspan"), "2");
  assert.equal(env.row.cells[1].getAttribute("rowspan"), "2");
  assert.deepEqual(cell.childNodes.map((node) => node.text), ["Merged text"]);
  assert.equal(env.focusedCell, env.row.cells[1]);
  env.api.splitTableCell();
  assert.equal(env.row.cells.length, 3);
  assert.equal(env.row.cells[1].hasAttribute("colspan"), false);
  assert.equal(env.row.cells[2].hasAttribute("colspan"), false);
}

{
  const first = new Cell("td", {}, "A");
  const spanning = new Cell("td", { rowspan: 2 }, "B");
  const env = createEnvironment([first, spanning]);
  assert.deepEqual(env.api.selectedTableCells(), []);
  assert.equal(env.notices.length, 0);
}

process.stdout.write("Table editing tests passed: adjacent selection, content-preserving merge, span-aware split, and unsupported selection guards.\n");
