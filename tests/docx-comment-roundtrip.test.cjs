const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const resolverStart = app.indexOf("  function resolveReviewCommentStart(");
const resolverEnd = app.indexOf("  function reviewCommentRange(", resolverStart);
const serializerStart = app.indexOf("  function wordXmlText(");
const serializerEnd = app.indexOf("  async function exportDocx(", serializerStart);
const zipWriterStart = app.indexOf("  function makeStoredZip(");
const zipWriterEnd = app.indexOf("  function docxExportWarnings(", zipWriterStart);
const archiveStart = app.indexOf("  function inspectDocxArchive(");
const archiveEnd = app.indexOf("  function readWordRevisionParagraphs(", archiveStart);
const mapperStart = app.indexOf("  function mapDocxCommentsToReviewComments(");
const mapperEnd = app.indexOf("  async function readDocxRevisionCounts(", mapperStart);
assert.ok(resolverStart >= 0 && resolverEnd > resolverStart, "review comment resolver is present");
assert.ok(serializerStart >= 0 && serializerEnd > serializerStart, "DOCX serializer is present");
assert.ok(zipWriterStart >= 0 && zipWriterEnd > zipWriterStart, "DOCX ZIP writer is present");
assert.ok(archiveStart >= 0 && archiveEnd > archiveStart, "DOCX archive reader is present");
assert.ok(mapperStart >= 0 && mapperEnd > mapperStart, "Word comment import reader is present");

const source = [
  app.slice(resolverStart, resolverEnd),
  app.slice(serializerStart, serializerEnd),
  app.slice(zipWriterStart, zipWriterEnd),
  app.slice(archiveStart, archiveEnd),
  app.slice(mapperStart, mapperEnd),
  "return { makeWordPackage, makeStoredZip, inspectDocxArchive, readDocxReviewComments, readDocxPageLayout };",
].join("\n");
const factory = new Function("Node", "editor", "title", "atob", "$", "pageNumbersEnabled", "pageHeaderText", "pageFooterText", "DOMParser", source);

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
function decodeXml(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
    if (entity === "amp") return "&";
    if (entity === "lt") return "<";
    if (entity === "gt") return ">";
    if (entity === "quot") return '"';
    if (entity === "apos") return "'";
    const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return String.fromCodePoint(code);
  });
}
function parseXml(xml) {
  const documentNode = { nodeType: 9, childNodes: [], getElementsByTagNameNS(ns, name) { return descendants(this, (node) => node.namespaceURI === ns && node.localName === name); }, getElementsByTagName(name) { return descendants(this, (node) => node.nodeName === name); } };
  const stack = [{ node: documentNode, namespaces: { xml: "http://www.w3.org/XML/1998/namespace" } }];
  const tokens = xml.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>|[^<]+/g) || [];
  for (const token of tokens) {
    if (token.startsWith("<!--") || token.startsWith("<?")) continue;
    if (token.startsWith("<![CDATA[")) {
      stack.at(-1).node.childNodes.push({ nodeType: 3, nodeValue: token.slice(9, -3), textContent: token.slice(9, -3), childNodes: [] });
      continue;
    }
    if (token.startsWith("</")) { stack.pop(); continue; }
    if (token.startsWith("<!")) continue;
    if (token.startsWith("<")) {
      const tagMatch = token.match(/^<([^\s/>]+)([\s\S]*?)\/?\s*>$/);
      if (!tagMatch) throw new Error("Invalid XML tag " + token);
      const qName = tagMatch[1];
      const rawAttrs = tagMatch[2];
      const parentNamespaces = stack.at(-1).namespaces;
      const namespaces = { ...parentNamespaces };
      const attributes = {};
      for (const match of rawAttrs.matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
        const name = match[1], value = decodeXml(match[3] ?? match[4] ?? "");
        attributes[name] = value;
        if (name === "xmlns") namespaces[""] = value;
        else if (name.startsWith("xmlns:")) namespaces[name.slice(6)] = value;
      }
      const prefix = qName.includes(":") ? qName.split(":")[0] : "";
      const localName = qName.split(":").pop();
      const attrNamespaces = {};
      for (const [name, value] of Object.entries(attributes)) {
        if (name === "xmlns" || name.startsWith("xmlns:")) continue;
        const attrPrefix = name.includes(":") ? name.split(":")[0] : "";
        attrNamespaces[(namespaces[attrPrefix] || "") + "|" + name.split(":").pop()] = value;
      }
      const node = {
        nodeType: 1, nodeName: qName, localName, namespaceURI: namespaces[prefix] || "",
        childNodes: [],
        getAttribute(name) { return Object.hasOwn(attributes, name) ? attributes[name] : null; },
        getAttributeNS(ns, name) { return Object.hasOwn(attrNamespaces, (ns || "") + "|" + name) ? attrNamespaces[(ns || "") + "|" + name] : null; },
        getElementsByTagNameNS(ns, name) { return descendants(this, (child) => child.namespaceURI === ns && child.localName === name); },
      };
      Object.defineProperty(node, "textContent", { get() { return this.childNodes.map((child) => child.textContent || "").join(""); } });
      stack.at(-1).node.childNodes.push(node);
      if (!token.endsWith("/>")) stack.push({ node, namespaces });
      continue;
    }
    const value = decodeXml(token);
    stack.at(-1).node.childNodes.push({ nodeType: 3, nodeValue: value, textContent: value, childNodes: [] });
  }
  return documentNode;
}
function descendants(node, predicate) {
  const found = [];
  const visit = (parent) => {
    for (const child of parent.childNodes || []) {
      if (child.nodeType === 1) {
        if (predicate(child)) found.push(child);
        visit(child);
      }
    }
  };
  visit(node);
  return found;
}
class DOMParserForTest {
  parseFromString(xml) { return parseXml(xml); }
}
const paragraph = (value) => {
  const text = { nodeType: Node.TEXT_NODE, nodeValue: value };
  return {
    nodeType: Node.ELEMENT_NODE, tagName: "P", children: [text], childNodes: [text], style: { textAlign: "" },
    getAttribute() { return null; }, closest() { return null; },
  };
};
const root = { children: [paragraph("alpha beta")] };
const page = { classList: { contains() { return false; } } };
const api = factory(Node, root, () => "DOCX comment round-trip", atob, () => page, false, "", "", DOMParserForTest);
const sourceComments = [
  { quote: "alpha", start: 0, before: "", after: " beta", body: "Check & revise <this>", author: "Ada Reviewer", createdAt: Date.parse("2026-11-12T10:00:00Z"), resolved: true },
  { quote: "beta", start: 6, before: "alpha ", after: "", body: "Follow up", author: "Second Reviewer", createdAt: Date.parse("2026-11-12T10:01:00Z"), resolved: false },
];
const exported = api.makeWordPackage(root, { paper: "a4", orientation: "portrait", margins: "normal", pageNumbers: true, header: "Round-trip header", footer: "Round-trip footer" }, sourceComments);
assert.equal(exported.exportedCommentCount, 2);
assert.equal(exported.omittedCommentCount, 0);

(async () => {
  const zipped = api.makeStoredZip(exported.files);
  const buffer = await zipped.arrayBuffer();
  const archive = api.inspectDocxArchive(buffer);
  const exportedLayout = await api.readDocxPageLayout(buffer, archive);
  assert.deepEqual(exportedLayout.layout, { paper: "a4", orientation: "portrait", margins: "normal" });
  assert.equal(exportedLayout.header, "Round-trip header");
  assert.equal(exportedLayout.footer, "Round-trip footer");
  assert.equal(exportedLayout.pageNumbers, true);
  const imported = await api.readDocxReviewComments(buffer, archive, "alpha beta");
  assert.equal(Boolean(imported.unreadable), false);
  assert.equal(imported.total, 2);
  assert.equal(imported.omitted, 0);
  assert.equal(imported.comments.length, 2);
  assert.deepEqual(imported.comments.map((comment) => comment.quote), ["alpha", "beta"]);
  assert.deepEqual(imported.comments.map((comment) => comment.author), ["Ada Reviewer", "Second Reviewer"]);
  assert.deepEqual(imported.comments.map((comment) => comment.resolved), [true, false]);
  assert.deepEqual(imported.comments.map((comment) => comment.body), ["Check & revise <this>", "Follow up"]);
  assert.deepEqual(imported.comments.map((comment) => comment.createdAt), sourceComments.map((comment) => comment.createdAt));
  const fixturePrefix = "Sentence from an external file: ";
  const independentFiles = {
    "[Content_Types].xml": '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/><Override PartName="/word/commentsExtended.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml"/></Types>',
    "_rels/.rels": '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    "word/_rels/document.xml.rels": '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdComments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/><Relationship Id="rIdCommentsEx" Type="http://schemas.microsoft.com/office/2011/relationships/commentsExtended" Target="commentsExtended.xml"/><Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>',
    "word/document.xml": '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:t xml:space="preserve">' + fixturePrefix + '</w:t></w:r><w:commentRangeStart w:id="4"/><w:r><w:t>original source</w:t></w:r><w:commentRangeEnd w:id="4"/><w:r><w:commentReference w:id="4"/></w:r><w:r><w:t>.</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="default" r:id="rIdF"/><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>',
    "word/header1.xml": '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>External header</w:t></w:r></w:p></w:hdr>',
    "word/footer1.xml": '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>External footer </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>',
    "word/comments.xml": '<?xml version="1.0"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:comment w:id="4" w:author="External Word Author" w:initials="EWA" w:date="2025-04-03T09:30:00Z"><w:p w14:paraId="11223344"><w:pPr><w:pStyle w:val="CommentText"/></w:pPr><w:r><w:t>Review &amp; verify this citation.</w:t></w:r></w:p></w:comment></w:comments>',
    "word/commentsExtended.xml": '<?xml version="1.0"?><w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"><w15:commentEx w15:paraId="11223344" w15:done="1"/></w15:commentsEx>',
  };
  const independentBuffer = await api.makeStoredZip(independentFiles).arrayBuffer();
  const independentArchive = api.inspectDocxArchive(independentBuffer);
  const independentLayout = await api.readDocxPageLayout(independentBuffer, independentArchive);
  assert.deepEqual(independentLayout.layout, { paper: "a4", orientation: "landscape", margins: "narrow" });
  assert.equal(independentLayout.header, "External header");
  assert.equal(independentLayout.footer, "External footer");
  assert.equal(independentLayout.pageNumbers, true);
  const independent = await api.readDocxReviewComments(independentBuffer, independentArchive, fixturePrefix + "original source.");
  assert.equal(independent.total, 1);
  assert.equal(independent.omitted, 0);
  assert.equal(independent.comments.length, 1);
  assert.equal(independent.comments[0].quote, "original source");
  assert.equal(independent.comments[0].author, "External Word Author");
  assert.equal(independent.comments[0].body, "Review & verify this citation.");
  assert.equal(independent.comments[0].createdAt, Date.parse("2025-04-03T09:30:00Z"));
  assert.equal(independent.comments[0].resolved, true);
  const unsupportedFiles = { ...independentFiles, "word/document.xml": independentFiles["word/document.xml"].replace('w:w="16838"', 'w:w="10000"') };
  const unsupportedBuffer = await api.makeStoredZip(unsupportedFiles).arrayBuffer();
  const unsupportedArchive = api.inspectDocxArchive(unsupportedBuffer);
  const unsupportedLayout = await api.readDocxPageLayout(unsupportedBuffer, unsupportedArchive);
  assert.equal(unsupportedLayout.layout, null);
  assert.equal(unsupportedLayout.unsupported, true);
  process.stdout.write("DOCX import tests passed: comments round-tripped and supported page setup was restored from app and independent WordprocessingML packages.\n");
})().catch((error) => { console.error(error); process.exitCode = 1; });
