const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

global.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.match(source, /function imageAtSelection\(selection = window\.getSelection\(\)\)/, "images can be targeted from the editor selection");
assert.match(source, /action: "image-properties"/);
assert.match(source, /image\.alt = \$\("#image-alt-text"\)\.value\.slice\(0, 300\)/, "image descriptions are editable");
assert.match(source, /image\.setAttribute\("width", String\(width\)\)/, "image dimensions are persisted in the document model");
assert.match(html, /id="image-properties-dialog"[\s\S]*?id="image-alt-text"[\s\S]*?id="image-width-pixels"/);
const start = source.indexOf("  function wordXmlText(");
const end = source.indexOf("  async function exportDocx(", start);
assert.ok(start >= 0 && end > start, "DOCX serializer functions are present");

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S2sAAAAASUVORK5CYII=";
const src = `data:image/png;base64,${png}`;
const image = () => ({
  nodeType: 1, tagName: "IMG", children: [], childNodes: [], naturalWidth: 2, naturalHeight: 1,
  getAttribute(name) { return ({ src, alt: "Diagram & plan" })[name] || null; },
});
const paragraph = (child, attrs = {}) => ({
  nodeType: 1, tagName: "P", children: [child], childNodes: [child], style: { textAlign: "" }, textContent: "",
  getAttribute(name) { return attrs[name] || null; },
  closest() { return null; },
});

const tableCell = (textValue, spans = {}) => {
  const child = { nodeType: Node.TEXT_NODE, nodeValue: textValue };
  const block = paragraph(child);
  const attributes = { ...spans };
  return {
    nodeType: 1, tagName: "TD", children: [block], childNodes: [block],
    colSpan: Number(attributes.colspan) || 1, rowSpan: Number(attributes.rowspan) || 1,
    getAttribute(name) { return Object.hasOwn(attributes, name) ? String(attributes[name]) : null; },
    closest() { return null; },
  };
};
const verticalTable = (() => {
  const tbody = { tagName: "TBODY" };
  const table = {
    tagName: "TABLE", children: [tbody], childNodes: [tbody], rows: [],
    querySelectorAll(selector) { return selector === "tr" ? this.rows : []; },
  };
  const row = (cells) => ({
    tagName: "TR", children: cells, parentElement: tbody,
    closest(selector) { return selector === "table" ? table : null; },
  });
  table.rows.push(
    row([tableCell("Merged top", { rowspan: 2 }), tableCell("Top right")]),
    row([tableCell("Bottom right")]),
  );
  tbody.children = table.rows;
  return table;
})();
const pageBreak = { nodeType: 1, tagName: "HR", children: [], childNodes: [], textContent: "", getAttribute(name) { return name === "data-page-break" ? "true" : null; } };
const fontText = { nodeType: Node.TEXT_NODE, nodeValue: "Georgia type" };
const fontSpan = { nodeType: 1, tagName: "SPAN", children: [fontText], childNodes: [fontText], style: { fontFamily: "Georgia" }, getAttribute(name) { return ({ "data-font-family": "Georgia", "data-text-color": "#C00000", "data-highlight-color": "#FFFF00" })[name] || null; } };
const revisionText = (value) => ({ nodeType: Node.TEXT_NODE, nodeValue: value });
const insertionText = revisionText("new wording");
const deletionText = revisionText("old wording");
const insertion = { nodeType: 1, tagName: "INS", children: [insertionText], childNodes: [insertionText], style: {}, getAttribute(name) { return ({ "data-revision-id": "rev-ins-1", "data-revision-author": "Reviewer", "data-revision-created-at": "1762992000000" })[name] || null; } };
const deletion = { nodeType: 1, tagName: "DEL", children: [deletionText], childNodes: [deletionText], style: {}, getAttribute(name) { return ({ "data-revision-id": "rev-del-1", "data-revision-author": "Reviewer", "data-revision-created-at": "1762992000000" })[name] || null; } };
const root = { children: [{ tagName: "DIV", children: [paragraph(image()), pageBreak, paragraph(image()), paragraph(fontSpan, { "data-indent-level": "2", "data-line-spacing": "1.5", "data-paragraph-spacing": "12" }), paragraph(insertion), paragraph(deletion), verticalTable] }] };
const page = { classList: { contains() { return false; } } };
const factory = new Function("Node", "editor", "title", "atob", "$", "pageNumbersEnabled", "pageHeaderText", "pageFooterText", `${source.slice(start, end)}; return { makeWordPackage, makeStoredZip, setPageNumbers(value) { pageNumbersEnabled = value; }, setHeaderFooter(header, footer) { pageHeaderText = header; pageFooterText = footer; } };`);
const { makeWordPackage, makeStoredZip, setPageNumbers, setHeaderFooter } = factory(Node, root, () => "Image export QA", atob, () => page, true, "Project & scope", "Confidential");
const result = makeWordPackage(root);
assert.deepEqual(result.unsupported, []);
const zipBlob = makeStoredZip(result.files);

zipBlob.arrayBuffer().then((arrayBuffer) => {
  const buffer = Buffer.from(arrayBuffer);
  const entries = new Map();
  const view = new DataView(arrayBuffer);
  let offset = 0;
  while (offset + 30 <= buffer.length && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.toString("utf8", nameStart, nameStart + nameLength);
    entries.set(name, buffer.subarray(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  assert.equal(entries.size, 11, "one deduplicated media part, header, and footer are included");
  assert.match(entries.get("word/header1.xml").toString("utf8"), /Project &amp; scope/);
  assert.match(entries.get("word/footer1.xml").toString("utf8"), /Confidential/);
  assert.match(entries.get("word/footer1.xml").toString("utf8"), /w:fldSimple w:instr="PAGE"/);
  assert.match(entries.get("word/_rels/document.xml.rels").toString("utf8"), /relationships\/header" Target="header1.xml"/);
  assert.match(entries.get("[Content_Types].xml").toString("utf8"), /PartName="\/word\/header1.xml"/);
  assert.match(entries.get("word/document.xml").toString("utf8"), /w:footerReference w:type="default" r:id="rId\d+"/);
  assert.match(entries.get("word/_rels/document.xml.rels").toString("utf8"), /relationships\/footer" Target="footer1.xml"/);
  assert.match(entries.get("[Content_Types].xml").toString("utf8"), /PartName="\/word\/footer1.xml"/);
  assert.deepEqual(entries.get("word/media/image1.png"), Buffer.from(png, "base64"));
  const documentXml = entries.get("word/document.xml").toString("utf8");
  assert.equal((documentXml.match(/<wp:inline/g) || []).length, 2);
  assert.match(documentXml, /<w:br w:type="page"\/>/);
  assert.match(documentXml, /cx="19050" cy="9525"/);
  assert.match(documentXml, /Diagram &amp; plan/);
  assert.match(documentXml, /<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"\/>/);
  assert.match(documentXml, /<w:color w:val="C00000"\/>/);
  assert.match(documentXml, /<w:highlight w:val="yellow"\/>/);
  assert.match(documentXml, /<w:spacing w:line="360" w:lineRule="auto" w:after="240"\/>/);
  assert.match(documentXml, /<w:ind w:left="1440"\/>/);
  assert.match(documentXml, /<w:ins w:id="1" w:author="Reviewer" w:date="2025-11-13T00:00:00.000Z"><w:r><w:t>new wording<\/w:t><\/w:r><\/w:ins>/);
  assert.match(documentXml, /<w:del w:id="2" w:author="Reviewer" w:date="2025-11-13T00:00:00.000Z"><w:r><w:delText>old wording<\/w:delText><\/w:r><\/w:del>/);
  assert.equal((documentXml.match(/<w:gridCol\b/g) || []).length, 2, "vertical spans reserve their grid column");
  assert.match(documentXml, /<w:vMerge w:val="restart"\/>/);
  assert.match(documentXml, /<w:vMerge\/>/);

  assert.equal((entries.get("word/_rels/document.xml.rels").toString("utf8").match(/relationships\/image/g) || []).length, 1);
  assert.match(entries.get("[Content_Types].xml").toString("utf8"), /Extension="png" ContentType="image\/png"/);
  setPageNumbers(false);
  const withHeaderFooterNoPageNumber = makeWordPackage(root);
  assert.equal(Object.hasOwn(withHeaderFooterNoPageNumber.files, "word/footer1.xml"), true, "text footer remains when page numbering is off");
  assert.doesNotMatch(withHeaderFooterNoPageNumber.files["word/footer1.xml"], /w:fldSimple/);
  setHeaderFooter("", "");
  const withoutHeaderFooter = makeWordPackage(root);
  assert.equal(Object.hasOwn(withoutHeaderFooter.files, "word/header1.xml"), false, "header is omitted when empty");
  assert.equal(Object.hasOwn(withoutHeaderFooter.files, "word/footer1.xml"), false, "footer is omitted when empty and numbering is off");
  assert.doesNotMatch(withoutHeaderFooter.files["word/document.xml"], /w:(?:header|footer)Reference/);
  const conversionPackage = makeWordPackage(root, { paper: "letter", orientation: "landscape", margins: "narrow", pageNumbers: false, header: "", footer: "" });
  const conversionDocumentXml = conversionPackage.files["word/document.xml"];
  assert.match(conversionDocumentXml, /<w:pgSz w:w="15840" w:h="12240"\/>/);
  assert.match(conversionDocumentXml, /<w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/);
  assert.doesNotMatch(conversionDocumentXml, /w:(?:header|footer)Reference/);
  assert.equal(Object.hasOwn(conversionPackage.files, "word/header1.xml"), false);
  assert.equal(Object.hasOwn(conversionPackage.files, "word/footer1.xml"), false);
  process.stdout.write("DOCX export tests passed: page fields, conversion page setup, PNG media, DrawingML, formatting, dimensions, alt text and vertical table merges.\n");
}).catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });

