const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const resolverStart = app.indexOf("  function resolveReviewCommentStart(");
const resolverEnd = app.indexOf("  function reviewCommentRange(", resolverStart);
const serializerStart = app.indexOf("  function wordXmlText(");
const serializerEnd = app.indexOf("  async function exportDocx(", serializerStart);
assert.ok(resolverStart >= 0 && resolverEnd > resolverStart, "comment anchor resolver is present");
assert.ok(serializerStart >= 0 && serializerEnd > serializerStart, "DOCX package serializer is present");

const paragraph = (value) => {
  const text = { nodeType: Node.TEXT_NODE, nodeValue: value };
  return {
    nodeType: Node.ELEMENT_NODE, tagName: "P", children: [text], childNodes: [text], style: { textAlign: "" },
    getAttribute() { return null; }, closest() { return null; },
  };
};
const root = { children: [paragraph("alpha beta")] };
const page = { classList: { contains() { return false; } } };
const source = app.slice(resolverStart, resolverEnd) + "\n" + app.slice(serializerStart, serializerEnd) + "\nreturn { makeWordPackage, docxExportWarnings };";
const factory = new Function("Node", "editor", "title", "atob", "$", "pageNumbersEnabled", "pageHeaderText", "pageFooterText", source);
const api = factory(Node, root, () => "Comments QA", atob, () => page, false, "", "");
const comments = [
  { quote: "alpha", start: 0, before: "", after: " beta", body: "Check & revise <this>", author: "A & B", createdAt: Date.parse("2026-11-12T10:00:00Z"), resolved: true },
  { quote: "beta", start: 6, before: "alpha ", after: "", body: "Open issue", author: "Reviewer", createdAt: Date.parse("2026-11-12T10:01:00Z"), resolved: false },
  { quote: "missing", start: 99, before: "", after: "", body: "Unmatched", author: "Reviewer", createdAt: Date.parse("2026-11-12T10:02:00Z"), resolved: false },
];
const result = api.makeWordPackage(root, null, comments);
assert.deepEqual(result.unsupported, []);
assert.equal(result.exportedCommentCount, 2);
assert.equal(result.omittedCommentCount, 1);

const documentXml = result.files["word/document.xml"];
assert.match(documentXml, /<w:commentRangeStart w:id="0"\/>[\s\S]*alpha[\s\S]*<w:commentRangeEnd w:id="0"\/><w:r><w:commentReference w:id="0"\/><\/w:r>/);
assert.match(documentXml, /<w:commentRangeStart w:id="1"\/>[\s\S]*beta[\s\S]*<w:commentRangeEnd w:id="1"\/><w:r><w:commentReference w:id="1"\/><\/w:r>/);
const commentsXml = result.files["word/comments.xml"];
assert.match(commentsXml, /<w:comment w:id="0" w:author="A &amp; B" w:initials="A&amp;B" w:date="2026-11-12T10:00:00.000Z">/);
assert.match(commentsXml, /Check &amp; revise &lt;this&gt;/);
const extendedXml = result.files["word/commentsExtended.xml"];
assert.match(extendedXml, /w15:done="1"/);
assert.match(extendedXml, /w15:done="0"/);
assert.match(extendedXml, /w15:paraId="C0000000"/);
assert.match(commentsXml, /w14:paraId="C0000000"/);
assert.match(result.files["word/_rels/document.xml.rels"], /relationships\/comments" Target="comments.xml"/);
assert.match(result.files["word/_rels/document.xml.rels"], /relationships\/commentsExtended" Target="commentsExtended.xml"/);
assert.match(result.files["[Content_Types].xml"], /PartName="\/word\/comments.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.comments\+xml"/);
assert.match(result.files["[Content_Types].xml"], /PartName="\/word\/commentsExtended\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.commentsExtended\+xml"/);
assert.match(api.docxExportWarnings([], result.omittedCommentCount)[0], /cannot match 1 local comment/);
assert.deepEqual(api.docxExportWarnings([], 0), []);
assert.equal(Object.hasOwn(api.makeWordPackage(root).files, "word/comments.xml"), false, "conversion exports do not inherit open-document comments");

process.stdout.write("DOCX comment export tests passed: native anchors, comment content, author/date, resolved state, and unmatched-anchor warning.\n");
