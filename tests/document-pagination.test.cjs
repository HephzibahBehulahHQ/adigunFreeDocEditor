const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const start = source.indexOf("  function splitLongTextBlock(block, capacity, replaceBlock = true)");
const end = source.indexOf("  function splitListBetweenItems(list, capacity)", start);
assert.ok(start >= 0 && end > start);

const inserted = [];
const makeTextBlock = (text, tagName = "P", hasImage = false, measuredHeight = null) => {
  const block = {
    tagName,
    attributes: {},
    textNodes: [{ nodeValue: text }],
    getBoundingClientRect: () => ({ height: measuredHeight ?? Math.max(16, Math.ceil(text.length / 24) * 16) }),
    querySelector: () => hasImage ? {} : null,
    getAttribute(name) { return this.attributes[name] ?? null; },
    setAttribute(name, value) { this.attributes[name] = value; },
    cloneNode(deep) {
      return {
      tagName,
      textContent: deep ? text : "",
      attributes: { ...this.attributes },
      getAttribute(name) { return this.attributes[name] ?? null; },
      append(fragment) { this.textContent += fragment.textContent; },
      getBoundingClientRect() { return { height: Math.max(16, Math.ceil(this.textContent.length / 24) * 16) }; },
      setAttribute(name, value) { this.attributes[name] = value; },
      };
    },
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
assert.match(source, /table\.style\?\.setProperty\("--table-image-max-height"/, "nested table images use the remaining table-body height");
assert.match(styles, /\.document-page table img\{max-height:var\(--table-image-max-height,var\(--page-image-max-height,70vh\)\)/, "table images respect the header and cell-content space available on the sheet");
assert.deepEqual(inserted, fragments, "the paragraph is replaced by its visual fragments");
const unbroken = "🧪".repeat(30);
const unbrokenFragments = split(makeTextBlock(unbroken), 32);
assert.ok(unbrokenFragments.length > 1, "an unbroken word can split when it exceeds the page width");
assert.equal(unbrokenFragments.map((fragment) => fragment.textContent).join(""), unbroken, "code point fallback preserves supplementary Unicode characters");
assert.ok(split(makeTextBlock(text, "H2"), 32).length > 1, "long headings can flow across sheets without losing their heading tag");
assert.deepEqual(split(makeTextBlock(text, "P", true), 32).map((fragment) => fragment.tagName), ["P"], "paragraphs containing images are left intact");
inserted.length = 0;
const listItemFragments = split(makeTextBlock(text, "LI"), 32);
assert.ok(listItemFragments.length > 1, "an oversized plain list item splits across sheets");
assert.equal(listItemFragments.map((fragment) => fragment.textContent).join(""), text, "list-item splitting preserves every character in order");
assert.equal(listItemFragments[0].attributes["data-page-flow-continuation"], undefined, "the first list-item fragment keeps its list marker");
assert.ok(listItemFragments.slice(1).every((fragment) => fragment.attributes["data-page-flow-continuation"] === "true"), "continuation fragments do not create extra list markers");
assert.ok(listItemFragments.every((fragment) => fragment.attributes["data-page-flow-id"] === "f00d-1234"), "list-item fragments share a serialization identity");
assert.match(styles, /\.document-page li\[data-page-flow-continuation="true"\]\{list-style:none\}/, "continued list-item fragments do not display duplicate bullets or numbers");

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
const splitList = new Function("getComputedStyle", "crypto", "splitLongTextBlock", source.slice(listStart, listEnd) + "\nreturn splitListBetweenItems;")(
  () => ({ marginTop: "0", marginBottom: "0", paddingTop: "0", paddingBottom: "0", borderTopWidth: "0", borderBottomWidth: "0" }),
  { randomUUID: () => "beef-1234" },
  split
);
const listFragments = splitList(orderedList, 50);
assert.deepEqual(listFragments.map((fragment) => fragment.children.length), [2, 2, 1], "lists flow between whole list items");
assert.equal(listFragments[0].attributes.start, "3");
assert.equal(listFragments[1].attributes.start, "5", "ordered list numbering continues on the next sheet");
assert.equal(listFragments.map((fragment) => fragment.children).flat().length, listItems.length, "list splitting preserves every item");
assert.ok(listFragments.every((fragment) => fragment.attributes["data-page-flow-id"] === "beef-1234"));
assert.deepEqual(listFragmentsInserted, listFragments);

const oversizedItemListFragments = [];
const oversizedList = {
  tagName: "UL", children: [], attributes: {},
  getAttribute(name) { return this.attributes[name] ?? null; },
  cloneNode() {
    return {
      tagName: "UL", children: [], attributes: {},
      getAttribute(name) { return this.attributes[name] ?? null; },
      setAttribute(name, value) { this.attributes[name] = value; },
      append(item) { this.children.push(item); },
    };
  },
  replaceWith(...nodes) { oversizedItemListFragments.push(...nodes); },
};
const oversizedItem = makeTextBlock(text, "LI", false, 100);
oversizedItem.replaceWith = (...nodes) => { oversizedList.children.splice(oversizedList.children.indexOf(oversizedItem), 1, ...nodes); };
oversizedList.children.push(oversizedItem);
const oversizedListFragments = splitList(oversizedList, 50);
assert.ok(oversizedListFragments.length > 1, "a list with one oversized text item flows across sheets");
assert.equal(oversizedListFragments.flatMap((fragment) => fragment.children).map((item) => item.textContent).join(""), text, "list pagination keeps split item text in order");
assert.ok(oversizedListFragments.flatMap((fragment) => fragment.children).slice(1).every((item) => item.attributes["data-page-flow-continuation"] === "true"), "continuation list fragments carry no repeated markers");

const numberedListFragments = [];
const numberedList = {
  tagName: "OL", children: [], attributes: { start: "4" },
  getAttribute(name) { return this.attributes[name] ?? null; },
  cloneNode() {
    return {
      tagName: "OL", children: [], attributes: { ...this.attributes },
      getAttribute(name) { return this.attributes[name] ?? null; },
      setAttribute(name, value) { this.attributes[name] = value; },
      append(item) { this.children.push(item); },
    };
  },
  replaceWith(...nodes) { numberedListFragments.push(...nodes); },
};
const numberedOversizedItem = makeTextBlock(text, "LI", false, 100);
numberedOversizedItem.parentElement = numberedList;
numberedOversizedItem.replaceWith = (...nodes) => { numberedList.children.splice(numberedList.children.indexOf(numberedOversizedItem), 1, ...nodes); nodes.forEach((node) => { node.parentElement = numberedList; }); };
const followingItem = { tagName: "LI", attributes: {}, getAttribute(name) { return this.attributes[name] ?? null; }, getBoundingClientRect: () => ({ height: 20 }) };
numberedList.children.push(numberedOversizedItem, followingItem);
const numberedFragments = splitList(numberedList, 50);
const continuedPage = numberedFragments.find((fragment) => fragment.children.some((item) => item.attributes["data-page-flow-continuation"] === "true"));
assert.ok(continuedPage, "an oversized ordered-list item continues onto a later sheet");
assert.equal(continuedPage.getAttribute("start"), "5", "the next logical ordered-list item keeps the correct number");
assert.equal(continuedPage.children.find((item) => item.attributes["data-page-flow-continuation"] === "true").getAttribute("value"), "4", "a hidden continuation preserves the ordered-list counter");
assert.deepEqual(numberedListFragments, numberedFragments);

const tableStart = source.indexOf("  function splitTableBetweenRows(table, capacity)");
const tableEnd = source.indexOf("  function paginateEditor()", tableStart);
assert.ok(tableStart >= 0 && tableEnd > tableStart);
const spanGroupStart = source.indexOf("  function groupTableRowsBySpans(bodies)");
assert.ok(spanGroupStart >= 0 && spanGroupStart < tableStart);
const groupTableRows = new Function(source.slice(spanGroupStart, tableStart) + "\nreturn groupTableRowsBySpans;")();
const mergedSpanRows = [
  { tagName: "TR", children: [{ getAttribute: (name) => name === "rowspan" ? "2" : null }], getBoundingClientRect: () => ({ height: 20 }) },
  { tagName: "TR", children: [], getBoundingClientRect: () => ({ height: 20 }) },
  { tagName: "TR", children: [], getBoundingClientRect: () => ({ height: 20 }) },
];
assert.deepEqual(groupTableRows([{ tagName: "TBODY", children: mergedSpanRows }]).map((group) => group.length), [2, 1], "vertical merge rows stay together when tables paginate between row groups");
assert.deepEqual(groupTableRows([
  { tagName: "TBODY", children: mergedSpanRows.slice(0, 1) },
  { tagName: "TBODY", children: mergedSpanRows.slice(1) },
]).map((group) => group.length), [1, 1, 1], "row groups do not cross tbody boundaries");
const rowSplitStart = source.indexOf("  function splitTableRowBetweenContent(row, capacity)");
assert.ok(rowSplitStart >= 0 && rowSplitStart < tableStart, "oversized table rows have a text-cell splitting path");
const splitTableRow = new Function("splitLongTextBlock", "crypto", source.slice(rowSplitStart, tableStart) + "\nreturn splitTableRowBetweenContent;")(
  split,
  { randomUUID: () => "a22e-1234" }
);
const longCell = makeTextBlock(text, "TD", false, 100);
longCell.setAttribute("colspan", "2");
const shortCell = makeTextBlock("Label", "TD", false, 20);
const tableRow = {
  tagName: "TR", children: [longCell, shortCell],
  cloneNode() { return { tagName: "TR", children: [], attributes: {}, append(cell) { this.children.push(cell); }, setAttribute(name, value) { this.attributes[name] = value; } }; },
  setAttribute(name, value) { this.attributes ??= {}; this.attributes[name] = value; },
};
const rowFragments = splitTableRow(tableRow, 50);
assert.ok(rowFragments.length > 1, "an oversized text cell splits its row into page-sized visual fragments");
assert.equal(rowFragments.map((fragment) => fragment.children[0].textContent).join(""), text, "row splitting preserves all long-cell text in order");
assert.equal(rowFragments[0].children[1].textNodes?.map((node) => node.nodeValue).join("") ?? rowFragments[0].children[1].textContent, "Label", "the first fragment retains short neighboring cell content");
assert.ok(rowFragments.slice(1).every((fragment) => !fragment.children[1].textContent), "short neighboring cells are blank on continuation fragments");
assert.ok(rowFragments.every((fragment) => fragment.attributes["data-page-flow-id"] === "a22e-1234"), "row fragments retain a shared serialization identity");
assert.ok(rowFragments.every((fragment) => fragment.children[0].attributes.colspan === "2"), "horizontal merged cells keep their column span across row fragments");
const imageRow = {
  tagName: "TR", children: [makeTextBlock("Image", "TD", true, 100), makeTextBlock(text, "TD", false, 100)],
  cloneNode() { return { tagName: "TR", children: [], attributes: {}, append(cell) { this.children.push(cell); }, setAttribute(name, value) { this.attributes[name] = value; } }; },
};
const imageRowFragments = splitTableRow(imageRow, 50);
assert.ok(imageRowFragments.length > 1, "a row can split its text cell while retaining an image in a neighboring cell");
assert.equal(imageRowFragments[0].children[0].textContent, "Image", "the neighboring image cell appears in the first row fragment");
assert.ok(imageRowFragments.slice(1).every((fragment) => !fragment.children[0].textContent), "the image cell does not repeat on continuation rows");
const verticallyMergedCell = makeTextBlock(text, "TD", false, 100);
verticallyMergedCell.setAttribute("rowspan", "2");
const verticallyMergedRow = { tagName: "TR", children: [verticallyMergedCell] };
assert.deepEqual(splitTableRow(verticallyMergedRow, 50), [verticallyMergedRow], "vertical merges remain intact because they span adjacent table rows");
assert.equal(splitTableRow({ tagName: "TR", children: [makeTextBlock(text, "TD", true, 100)] }, 50).length, 1, "rows with nested images, lists, or tables remain intact");
assert.match(source.slice(tableStart, tableEnd), /splitTableRowBetweenContent\(entry\.row, bodyCapacity\)/, "table pagination splits rows that exceed sheet capacity");
const makeTableRow = (height, text) => ({
  tagName: "TR", text, children: [], getBoundingClientRect: () => ({ height }),
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
const splitTable = new Function("getComputedStyle", "crypto", "splitTableRowBetweenContent", "groupTableRowsBySpans", source.slice(tableStart, tableEnd) + "\nreturn splitTableBetweenRows;")(
  () => ({ marginTop: "0", marginBottom: "0" }),
  { randomUUID: () => "d00d-1234" },
  splitTableRow,
  groupTableRows
);
const tableFragments = splitTable(table, 75);
assert.deepEqual(tableFragments.map((fragment) => fragment.children.find((child) => child.tagName === "TBODY").children.length), [2, 1], "tables flow between whole rows");
assert.equal(tableFragments[0].children[0].attributes["data-page-header-copy"], undefined, "the first sheet owns the source header");
assert.equal(tableFragments[1].children[0].attributes["data-page-header-copy"], "true", "later sheets mark repeated header rows for serialization");
assert.equal(tableFragments.map((fragment) => fragment.children.find((child) => child.tagName === "TBODY").children).flat().length, bodyRows.length);
assert.ok(tableFragments.every((fragment) => fragment.attributes["data-page-flow-id"] === "d00d-1234"));
assert.deepEqual(tableFragmentsInserted, tableFragments);

const oversizedRowTableFragments = [];
const oversizedTableHeader = makeSection("THEAD", [makeTableRow(15, "Name")]);
const contentCells = [makeTextBlock(text, "TD", false, 100), makeTextBlock("Label", "TD", false, 20)];
const oversizedRow = {
  tagName: "TR", children: contentCells,
  getBoundingClientRect: () => ({ height: 100 }),
  cloneNode() {
    return {
      tagName: "TR", children: [], attributes: {},
      append(cell) { this.children.push(cell); },
      setAttribute(name, value) { this.attributes[name] = value; },
      getBoundingClientRect() { return { height: Math.max(...this.children.map((cell) => cell.getBoundingClientRect().height)) }; },
    };
  },
  replaceWith(...nodes) { oversizedBody.children.splice(oversizedBody.children.indexOf(oversizedRow), 1, ...nodes); },
};
const oversizedBody = makeSection("TBODY", [oversizedRow, makeTableRow(20, "Next row")]);
const tallTable = {
  tagName: "TABLE", children: [oversizedTableHeader, oversizedBody],
  style: { values: {}, setProperty(name, value) { this.values[name] = value; } },
  getBoundingClientRect: () => ({ height: 135 }),
  cloneNode() { return { tagName: "TABLE", children: [], attributes: {}, append(child) { this.children.push(child); }, setAttribute(name, value) { this.attributes[name] = value; } }; },
  replaceWith(...nodes) { oversizedRowTableFragments.push(...nodes); },
};
const splitTallTable = new Function("getComputedStyle", "crypto", "splitTableRowBetweenContent", "groupTableRowsBySpans", source.slice(tableStart, tableEnd) + "\nreturn splitTableBetweenRows;")(
  () => ({ marginTop: "0", marginBottom: "0" }),
  { randomUUID: () => "b22e-1234" },
  splitTableRow,
  groupTableRows
);
const tallTableFragments = splitTallTable(tallTable, 65);
assert.equal(tallTableFragments.length, 2, "an oversized text row can flow across sheets before the next table row");
assert.ok(tallTableFragments.every((fragment) => fragment.children.some((child) => child.tagName === "THEAD")), "the table header repeats on each sheet with a split row");
assert.equal(tallTableFragments.map((fragment) => fragment.children.find((child) => child.tagName === "TBODY").children.length).join(","), "1,2", "table rows remain in order around row fragments");
assert.equal(tallTable.style.values["--table-image-max-height"], "26px", "nested image height accounts for the repeated table header and cell space");
assert.deepEqual(oversizedRowTableFragments, tallTableFragments);

const verticalSpanRows = [
  { ...makeTableRow(20, "Merged start"), children: [{ getAttribute: (name) => name === "rowspan" ? "2" : null }] },
  makeTableRow(20, "Merged continuation"),
  makeTableRow(20, "Following row"),
];
const verticalSpanBody = makeSection("TBODY", verticalSpanRows);
const verticalSpanTable = {
  tagName: "TABLE", children: [makeSection("THEAD", [makeTableRow(15, "Header")]), verticalSpanBody],
  getBoundingClientRect: () => ({ height: 75 }),
  cloneNode() { return { tagName: "TABLE", children: [], attributes: {}, append(child) { this.children.push(child); }, setAttribute(name, value) { this.attributes[name] = value; } }; },
  replaceWith(...nodes) { this.fragments = nodes; },
};
const verticalSpanFragments = splitTable(verticalSpanTable, 65);
assert.equal(verticalSpanFragments.map((fragment) => fragment.children.find((child) => child.tagName === "TBODY").children.length).join(","), "2,1", "vertical merges stay inside one paginated table fragment");

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
