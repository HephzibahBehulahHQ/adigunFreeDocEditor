const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const start = source.indexOf("  function splitLongTextBlock(block, capacity)");
const end = source.indexOf("  function splitListBetweenItems(list, capacity)", start);
assert.ok(start >= 0 && end > start);

const inserted = [];
const makeTextBlock = (text, tagName = "P", hasImage = false) => {
  const block = {
    tagName,
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
  return block;
};
const paragraphRange = (block, _nodes, first, last) => {
  const selected = block.textNodes.map((node) => node.nodeValue).join("").slice(first, last);
  return {
    getBoundingClientRect: () => ({ height: Math.max(16, Math.ceil(selected.length / 24) * 16) }),
    cloneContents: () => ({ textContent: selected }),
  };
};
const split = new Function("getComputedStyle", "paragraphTextNodes", "paragraphRange", "crypto",
  source.slice(start, end) + "\nreturn splitLongTextBlock;")(
  () => ({ marginTop: "0", marginBottom: "0", paddingTop: "0", paddingBottom: "0", borderTopWidth: "0", borderBottomWidth: "0" }),
  (root) => root.textNodes,
  paragraphRange,
  { randomUUID: () => "f00d-1234" }
);

const text = "A long paragraph with several words that must be split across multiple pages.";
const paragraph = makeTextBlock(text);
const fragments = split(paragraph, 32);
assert.ok(fragments.length > 1, "over-height paragraphs are split into page-sized fragments");
assert.equal(fragments.map((fragment) => fragment.textContent).join(""), text, "splitting preserves every character in order");
assert.ok(fragments.slice(0, -1).every((fragment) => /\s$/.test(fragment.textContent)), "paragraph fragments end at word boundaries");
assert.ok(fragments.every((fragment) => fragment.attributes["data-page-flow-id"] === "f00d-1234"), "fragments retain a shared serialization identity");
assert.match(source, /const imageMaxHeight = Math\.max\(96, capacity - 32\)/, "page image limits follow the content area remaining after page margins");
assert.match(styles, /\.document-page img\{[^}]*max-height:var\(--page-image-max-height,70vh\)/, "images fit within the page content height while retaining their aspect ratio");
assert.deepEqual(inserted, fragments, "the paragraph is replaced by its visual fragments");
const unbroken = "🧪".repeat(30);
const unbrokenFragments = split(makeTextBlock(unbroken), 32);
assert.ok(unbrokenFragments.length > 1, "an unbroken word can split when it exceeds the page width");
assert.equal(unbrokenFragments.map((fragment) => fragment.textContent).join(""), unbroken, "code point fallback preserves supplementary Unicode characters");
assert.ok(split(makeTextBlock(text, "H2"), 32).length > 1, "long headings can flow across sheets without losing their heading tag");
assert.deepEqual(split(makeTextBlock(text, "P", true), 32).map((fragment) => fragment.tagName), ["P"], "paragraphs containing images are left intact");

const listStart = source.indexOf("  function splitListBetweenItems(list, capacity)");
const listEnd = source.indexOf("  function paginateEditor()", listStart);
assert.ok(listStart >= 0 && listEnd > listStart);
const listItems = Array.from({ length: 5 }, (_, index) => ({
  tagName: "LI",
  getBoundingClientRect: () => ({ height: 20 }),
  style: {},
  index,
}));
const listFragmentsInserted = [];
const orderedList = {
  tagName: "OL",
  children: listItems,
  attributes: { start: "3" },
  style: {},
  getAttribute(name) { return this.attributes[name] ?? null; },
  cloneNode() {
    return {
      tagName: "OL", children: [], attributes: { ...this.attributes },
      getAttribute(name) { return this.attributes[name] ?? null; },
      setAttribute(name, value) { this.attributes[name] = value; },
      append(item) { this.children.push(item); },
    };
  },
  replaceWith(...nodes) { listFragmentsInserted.push(...nodes); },
};
const splitList = new Function("getComputedStyle", "crypto", source.slice(listStart, listEnd) + "\nreturn splitListBetweenItems;")(
  () => ({ marginTop: "0", marginBottom: "0", paddingTop: "0", paddingBottom: "0", borderTopWidth: "0", borderBottomWidth: "0" }),
  { randomUUID: () => "beef-1234" }
);
const listFragments = splitList(orderedList, 50);
assert.deepEqual(listFragments.map((fragment) => fragment.children.length), [2, 2, 1], "lists flow between whole list items");
assert.equal(listFragments[0].attributes.start, "3");
assert.equal(listFragments[1].attributes.start, "5", "ordered list numbering continues on the next sheet");
assert.equal(listFragments.map((fragment) => fragment.children).flat().length, listItems.length, "list splitting preserves every item");
assert.ok(listFragments.every((fragment) => fragment.attributes["data-page-flow-id"] === "beef-1234"));
assert.deepEqual(listFragmentsInserted, listFragments);

const tableStart = source.indexOf("  function splitTableBetweenRows(table, capacity)");
const tableEnd = source.indexOf("  function paginateEditor()", tableStart);
assert.ok(tableStart >= 0 && tableEnd > tableStart);
const makeTableRow = (height, text) => ({
  tagName: "TR", text, getBoundingClientRect: () => ({ height }),
  cloneNode() { return makeTableRow(height, text); },
});
const makeSection = (tagName, children = []) => ({
  tagName, children: [...children], attributes: {},
  getAttribute(name) { return this.attributes[name] ?? null; },
  setAttribute(name, value) { this.attributes[name] = value; },
  append(child) { this.children.push(child); },
  cloneNode(deep) { return makeSection(tagName, deep ? children.map((child) => child.cloneNode(true)) : []); },
});
const tableHeaderRow = makeTableRow(20, "Name");
const bodyRows = [makeTableRow(25, "Ada"), makeTableRow(25, "Grace"), makeTableRow(25, "Katherine")];
const tableFragmentsInserted = [];
const table = {
  tagName: "TABLE", children: [makeSection("THEAD", [tableHeaderRow]), makeSection("TBODY", bodyRows)],
  getBoundingClientRect: () => ({ height: 95 }),
  cloneNode() { return { tagName: "TABLE", children: [], attributes: {}, append(child) { this.children.push(child); }, setAttribute(name, value) { this.attributes[name] = value; } }; },
  replaceWith(...nodes) { tableFragmentsInserted.push(...nodes); },
};
const splitTable = new Function("getComputedStyle", "crypto", source.slice(tableStart, tableEnd) + "\nreturn splitTableBetweenRows;")(
  () => ({ marginTop: "0", marginBottom: "0" }),
  { randomUUID: () => "d00d-1234" }
);
const tableFragments = splitTable(table, 75);
assert.deepEqual(tableFragments.map((fragment) => fragment.children.find((child) => child.tagName === "TBODY").children.length), [2, 1], "tables flow between whole rows");
assert.equal(tableFragments[0].children[0].attributes["data-page-header-copy"], undefined, "the first sheet owns the source header");
assert.equal(tableFragments[1].children[0].attributes["data-page-header-copy"], "true", "later sheets mark repeated header rows for serialization");
assert.equal(tableFragments.map((fragment) => fragment.children.find((child) => child.tagName === "TBODY").children).flat().length, bodyRows.length);
assert.ok(tableFragments.every((fragment) => fragment.attributes["data-page-flow-id"] === "d00d-1234"));
assert.deepEqual(tableFragmentsInserted, tableFragments);

const outlineStart = source.indexOf("  function editorOutlineHeadings()");
const outlineEnd = source.indexOf("  function renderOutline()", outlineStart);
assert.ok(outlineStart >= 0 && outlineEnd > outlineStart);
const headingFragments = [
  { tagName: "H2", innerText: "Long heading ", attributes: { "data-page-flow-id": "cafe-1234" }, getAttribute(name) { return this.attributes[name] ?? null; } },
  { tagName: "H2", innerText: "across pages", attributes: { "data-page-flow-id": "cafe-1234" }, getAttribute(name) { return this.attributes[name] ?? null; } },
  { tagName: "H2", innerText: "Next section", attributes: {}, getAttribute(name) { return this.attributes[name] ?? null; } },
];
const outlineApi = new Function("editor", source.slice(outlineStart, outlineEnd) + "\nreturn { editorOutlineHeadings, outlineHeadingText };")({
  querySelectorAll(selector) {
    if (selector === "h1, h2, h3") return headingFragments;
    return headingFragments.filter((heading) => selector === `${heading.tagName.toLowerCase()}[data-page-flow-id="${heading.getAttribute("data-page-flow-id")}"]` && heading.getAttribute("data-page-flow-id"));
  },
});
const outlineHeadings = outlineApi.editorOutlineHeadings();
assert.equal(outlineHeadings.length, 2, "split headings appear once in the document outline");
assert.equal(outlineApi.outlineHeadingText(outlineHeadings[0]), "Long heading across pages", "the outline label includes every heading fragment");
console.log("Document pagination checks passed");
