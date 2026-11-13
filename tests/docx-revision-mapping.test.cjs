const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = source.indexOf("  function orderedDocxRevisionOperations(");
const end = source.indexOf("  function sanitizeDocxHtml(", start);
assert.ok(start >= 0 && end > start, "DOCX revision mapping functions are present");

class TextNode {
  constructor(value) { this.nodeType = 3; this.nodeValue = value; this.parentNode = null; }
  get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
  get textContent() { return this.nodeValue; }
}
class Fragment {
  constructor() { this.nodeType = 11; this.childNodes = []; }
}
class Element {
  constructor(tagName) { this.nodeType = 1; this.tagName = tagName.toUpperCase(); this.childNodes = []; this.attributes = new Map(); this.parentNode = null; }
  get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
  get textContent() { return this.childNodes.map((node) => node.textContent).join(""); }
  set textContent(value) { this.childNodes = []; if (value) this.appendChild(new TextNode(String(value))); }
  get innerHTML() { return this.childNodes.map(serialize).join(""); }
  append(...nodes) { for (const node of nodes) this.appendChild(node); }
  appendChild(node) {
    if (node.nodeType === 11) { for (const child of [...node.childNodes]) this.appendChild(child); node.childNodes = []; return node; }
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this; this.childNodes.push(node); return node;
  }
  insertBefore(node, reference) {
    if (!reference) return this.appendChild(node);
    if (node.parentNode) node.parentNode.removeChild(node);
    const index = this.childNodes.indexOf(reference);
    node.parentNode = this; this.childNodes.splice(index, 0, node); return node;
  }
  removeChild(node) { const index = this.childNodes.indexOf(node); if (index >= 0) this.childNodes.splice(index, 1); node.parentNode = null; return node; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  closest(selector) {
    let node = this;
    while (node?.nodeType === 1) {
      if (selector === "del[data-revision-id]" && node.tagName === "DEL" && node.getAttribute("data-revision-id")) return node;
      node = node.parentElement;
    }
    return null;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const tags = selector.split(",").map((tag) => tag.trim().toUpperCase());
    const found = [];
    const visit = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType !== 1) continue;
        if (tags.includes(child.tagName)) found.push(child);
        visit(child);
      }
    };
    visit(this); return found;
  }
}
function escapeHtml(value) { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function serialize(node) {
  if (node.nodeType === 3) return escapeHtml(node.nodeValue);
  const attrs = [...node.attributes].map(([name, value]) => ` ${name}="${escapeHtml(value)}"`).join("");
  return `<${node.tagName.toLowerCase()}${attrs}>${node.innerHTML}</${node.tagName.toLowerCase()}>`;
}
class FakeDOMParser {
  parseFromString(html) {
    const document = new Element("document");
    const stack = [document];
    for (const token of html.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith("</")) { stack.pop(); continue; }
      if (token.startsWith("<")) {
        const match = token.match(/^<([a-z0-9]+)/i);
        if (!match) continue;
        const element = new Element(match[1]);
        for (const attr of token.matchAll(/([a-z-]+)="([^"]*)"/gi)) element.setAttribute(attr[1], attr[2]);
        stack.at(-1).appendChild(element);
        if (!token.endsWith("/>")) stack.push(element);
      } else stack.at(-1).appendChild(new TextNode(token));
    }
    return document;
  }
}
const browserDocument = {
  createElement(tagName) { return new Element(tagName); },
  createTreeWalker(root) {
    const textNodes = [];
    const visit = (node) => { for (const child of node.childNodes) child.nodeType === 3 ? textNodes.push(child) : visit(child); };
    visit(root);
    let index = 0;
    return { nextNode() { return textNodes[index++] || null; } };
  },
  createRange() { return new FakeRange(); },
};
class FakeRange {
  setStart(node, offset) { this.startNode = node; this.startOffset = offset; }
  setEnd(node, offset) { this.endNode = node; this.endOffset = offset; }
  collapse(toStart) { if (toStart) { this.endNode = this.startNode; this.endOffset = this.startOffset; } }
  extractContents() {
    assert.equal(this.startNode, this.endNode, "test fixture keeps each inserted segment in one text node");
    const node = this.startNode, start = this.startOffset, end = this.endOffset;
    const fragment = new Fragment();
    fragment.childNodes.push(new TextNode(node.nodeValue.slice(start, end)));
    node.nodeValue = node.nodeValue.slice(0, start) + node.nodeValue.slice(end);
    this.endNode = this.startNode; this.endOffset = start;
    return fragment;
  }
  insertNode(inserted) {
    const node = this.startNode, parent = node.parentNode, index = parent.childNodes.indexOf(node), offset = this.startOffset;
    const before = node.nodeValue.slice(0, offset), after = node.nodeValue.slice(offset);
    const replacements = [];
    if (before) replacements.push(new TextNode(before));
    replacements.push(inserted);
    if (after) replacements.push(new TextNode(after));
    parent.removeChild(node);
    for (const replacement of replacements.reverse()) parent.insertBefore(replacement, parent.childNodes[index] || null);
  }
}
const NodeFilter = { SHOW_TEXT: 4 };
const api = new Function("DOMParser", "document", "NodeFilter", `${source.slice(start, end)}; return { mapDocxRevisionsToHtml };`)(FakeDOMParser, browserDocument, NodeFilter);
const sourceHtml = "<p>alpha AB omega</p>";
const paragraph = { acceptedText: "alpha AB omega", unsupported: false, operations: [
  { kind: "insert", text: "A", start: 6, id: "1", author: "Alice", date: "2026-11-12T10:00:00Z" },
  { kind: "delete", text: "X", start: 7, id: "2", author: "Bob", date: "2026-11-12T10:01:00Z" },
  { kind: "insert", text: "B", start: 7, id: "3", author: "Cara", date: "2026-11-12T10:02:00Z" },
] };
const mapped = api.mapDocxRevisionsToHtml(sourceHtml, [paragraph]);
assert.deepEqual(mapped.preserved, { insertions: 2, deletions: 1 });
assert.ok(mapped.html.indexOf(">A</ins>") < mapped.html.indexOf(">X</del>"));
assert.ok(mapped.html.indexOf(">X</del>") < mapped.html.indexOf(">B</ins>"));
assert.match(mapped.html, /data-revision-author="Alice"/);
assert.match(mapped.html, /data-revision-author="Bob"/);
assert.match(mapped.html, /data-revision-author="Cara"/);
const mismatch = api.mapDocxRevisionsToHtml(sourceHtml, [{ ...paragraph, acceptedText: "different source" }]);
assert.equal(mismatch.html, sourceHtml, "paragraph alignment failure leaves converted HTML untouched");
assert.deepEqual(mismatch.preserved, { insertions: 0, deletions: 0 });
process.stdout.write("DOCX mapping tests passed: native mapper preserves adjacent revision order, metadata, counts, and safe alignment fallback.\\n");
