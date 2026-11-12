const assert = require("node:assert/strict");

global.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
global.window = {};
global.location = { href: "https://adigunfreedoceditor.hephzibahbehulah.com/" };
require("../document-model.js");
const modelApi = window.AdigunDocumentModel;

const text = (value) => ({ nodeType: Node.TEXT_NODE, nodeValue: value });
const element = (tag, attrs = {}, children = [], align = "") => ({
  nodeType: Node.ELEMENT_NODE,
  tagName: tag.toUpperCase(),
  childNodes: children,
  style: { textAlign: align },
  getAttribute(name) { return Object.hasOwn(attrs, name) ? String(attrs[name]) : null; },
});

const source = element("div", {}, [
  element("p", {}, [element("strong", {}, [text("A <useful> & safe" )])], "center"),
  element("table", {}, [element("tbody", {}, [element("tr", {}, [element("td", { colspan: 2 }, [element("p", {}, [text("Cell")])])])])]),
  element("a", { href: "javascript:alert(1)" }, [text("unsafe link")]),
  element("script", {}, [text("plain text")]),
  element("img", { src: "data:image/png;base64,aGVsbG8=", alt: "Diagram" }),
  element("img", { src: "https://invalid.example/image.png" }),
]);
const model = modelApi.fromDOM(source);
assert.equal(model.type, "adigun-document");
assert.equal(model.version, 1);
const html = modelApi.toHTML(model);
assert.match(html, /<p style="text-align:center"><strong>A &lt;useful&gt; &amp; safe<\/strong><\/p>/);
assert.match(html, /colspan="2"/);
assert.match(html, /unsafe link/);
assert.doesNotMatch(html, /javascript:|<script|https:\/\/invalid\.example/);
assert.match(html, /<img src="data:image\/png;base64,aGVsbG8=" alt="Diagram">/);
assert.match(html, /plain text/);
assert.deepEqual(modelApi.normalize({ type: "adigun-document", version: 2, content: model.content }).content, []);
process.stdout.write("Document model tests passed: schema versioning, formatting, table spans, text escaping, and unsafe link/image rejection.\n");

