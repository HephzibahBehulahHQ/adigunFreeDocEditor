const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const resolverStart = app.indexOf("  function resolveReviewCommentStart(");
const resolverEnd = app.indexOf("  function reviewCommentRange(", resolverStart);
const mapperStart = app.indexOf("  function mapDocxCommentsToReviewComments(");
const mapperEnd = app.indexOf("  async function readDocxZipPartText(", mapperStart);
assert.ok(resolverStart >= 0 && resolverEnd > resolverStart, "review comment resolver exists");
assert.ok(mapperStart >= 0 && mapperEnd > mapperStart, "Word comment mapper exists");

const source = app.slice(resolverStart, resolverEnd) + "\n" + app.slice(mapperStart, mapperEnd) + "\nreturn mapDocxCommentsToReviewComments;";
const mapComments = new Function(source)();

const wordNs = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const word14Ns = "http://schemas.microsoft.com/office/word/2010/wordml";
const word15Ns = "http://schemas.microsoft.com/office/word/2012/wordml";
function text(value) { return { nodeType: 3, nodeValue: value, textContent: value, childNodes: [] }; }
function element(localName, attrs = {}, children = [], namespaceURI = wordNs) {
  const node = { nodeType: 1, localName, nodeName: "w:" + localName, namespaceURI, childNodes: children };
  node.getAttributeNS = (ns, name) => ns === namespaceURI ? (attrs[name] ?? null) : null;
  node.getAttribute = (name) => attrs[name.split(":").pop()] ?? null;
  node.getElementsByTagNameNS = (ns, name) => {
    const found = [];
    const visit = (current) => {
      for (const child of current.childNodes || []) {
        if (child.nodeType === 1) {
          if (child.namespaceURI === ns && child.localName === name) found.push(child);
          visit(child);
        }
      }
    };
    visit(node);
    return found;
  };
  Object.defineProperty(node, "textContent", { get() { return children.map((child) => child.textContent || "").join(""); } });
  return node;
}

const documentXml = element("document", {}, [
  element("body", {}, [element("p", {}, [
    element("r", {}, [element("t", {}, [text("prefix ")])]),
    element("commentRangeStart", { id: "1" }),
    element("r", {}, [element("t", {}, [text("repeat anchor")])]),
    element("commentRangeEnd", { id: "1" }),
    element("r", {}, [element("t", {}, [text(" / ")])]),
    element("del", {}, [element("r", {}, [element("delText", {}, [text("removed ")])])]),
    element("r", {}, [element("t", {}, [text("repeat anchor")])]),
  ])]),
]);
const commentsXml = element("comments", {}, [
  element("comment", { id: "1", author: "Ada Reviewer", date: "2026-11-12T10:00:00Z", paraId: "A1B2C3D4" }, [
    element("p", {}, [element("r", {}, [element("t", {}, [text("Please verify & approve.")])])]),
  ]),
  element("comment", { id: "2", author: "Missing anchor", date: "2026-11-12T10:01:00Z" }, [
    element("p", {}, [element("r", {}, [element("t", {}, [text("This range no longer exists.")])])]),
  ]),
]);
const commentsExtendedXml = element("commentsEx", {}, [
  element("commentEx", { paraId: "A1B2C3D4", done: "1" }, [], word15Ns),
], word15Ns);
const result = mapComments(documentXml, commentsXml, commentsExtendedXml, "prefix repeat anchor / repeat anchor");

assert.equal(result.total, 2);
assert.equal(result.omitted, 1);
assert.equal(result.comments.length, 1);
assert.equal(result.comments[0].quote, "repeat anchor");
assert.equal(result.comments[0].start, 7);
assert.equal(result.comments[0].author, "Ada Reviewer");
assert.equal(result.comments[0].createdAt, Date.parse("2026-11-12T10:00:00Z"));
assert.equal(result.comments[0].resolved, true);
assert.equal(result.comments[0].body, "Please verify & approve.");
assert.ok(app.includes("reviewComments = normalizeReviewComments(importedCommentData.comments)"), "DOCX import stores comments in local review metadata");
assert.ok(app.includes("if (hasImportedRevisions || reviewComments.length)"), "the review workspace opens when comments were imported");
assert.ok(app.includes("Source Word comments ("), "DOCX conversion warns when source comments are not retained");

process.stdout.write("DOCX comment import tests passed: text anchors, author/date, resolved state, deleted text, and unmatched warning path.\n");
