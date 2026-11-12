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
  style: { textAlign: align, color: attrs["style-color"] || "", backgroundColor: attrs["style-background-color"] || "" },
  getAttribute(name) { return Object.hasOwn(attrs, name) ? String(attrs[name]) : null; },
});

const source = element("div", {}, [
  element("div", { "data-editor-page": "true" }, [element("p", {}, [element("strong", {}, [text("A <useful> & safe" )])], "center")]),
  element("table", {}, [element("tbody", {}, [element("tr", {}, [element("td", { colspan: 2, rowspan: 2 }, [element("p", {}, [text("Cell")])])])])]),
  element("span", { "data-font-family": "Georgia" }, [text("Georgia text")]),
  element("p", { "data-indent-level": "2", "data-line-spacing": "1.5", "data-paragraph-spacing": "12" }, [text("Spaced paragraph")]),
  element("p", { "data-indent-level": "5", "data-line-spacing": "4", "data-paragraph-spacing": "12pt" }, [text("Invalid spacing")]),
  element("span", { "data-text-color": "#C00000", "data-highlight-color": "#FFFF00" }, [text("colored text")]),
  element("span", { "data-text-color": "#ABCDEF", "data-highlight-color": "url(javascript:alert(1))" }, [text("untrusted color")]),
  element("span", { "style-color": "rgb(192, 0, 0)", "style-background-color": "rgb(255, 255, 0)" }, [text("rgb colors")]),
  element("span", { "style-color": "rgba(192, 0, 0, 0.5)" }, [text("translucent color")]),
  element("span", { "data-font-family": "Arial; color: red" }, [text("untrusted family")]),
  element("font", { face: "Calibri" }, [text("legacy font")]),
  element("a", { href: "javascript:alert(1)" }, [text("unsafe link")]),
  element("hr", { "data-page-break": "true" }),
  element("hr", { "data-page-break": "false" }),
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
assert.match(html, /rowspan="2"/);
assert.match(html, /<span data-font-family="Georgia" style="font-family:Georgia">Georgia text<\/span>/);
assert.match(html, /<p data-indent-level="2" data-line-spacing="1.5" data-paragraph-spacing="12" style="margin-left:72pt;line-height:1.5;margin-bottom:12pt">Spaced paragraph<\/p>/);
assert.match(html, /<p>Invalid spacing<\/p>/);
assert.match(html, /<span data-text-color="#C00000" data-highlight-color="#FFFF00" style="color:#C00000;background-color:#FFFF00">colored text<\/span>/);
assert.match(html, /<span data-text-color="#C00000" data-highlight-color="#FFFF00" style="color:#C00000;background-color:#FFFF00">rgb colors<\/span>/);
assert.match(html, /untrusted color/);
assert.match(html, /translucent color/);
assert.doesNotMatch(html, /data-text-color="#C00000" style="color:#C00000">translucent color/);
assert.doesNotMatch(html, /data-text-color="#ABCDEF"|javascript:alert/);
assert.match(html, /<span data-font-family="Calibri" style="font-family:Calibri">legacy font<\/span>/);
assert.match(html, /untrusted family/);
assert.doesNotMatch(html, /data-font-family="Arial; color: red"/);
assert.equal((html.match(/data-page-break="true"/g) || []).length, 1);
assert.doesNotMatch(html, /data-page-break="false"/);
assert.match(html, /unsafe link/);
assert.doesNotMatch(html, /javascript:|<script|https:\/\/invalid\.example/);
assert.match(html, /<img src="data:image\/png;base64,aGVsbG8=" alt="Diagram">/);
assert.match(html, /plain text/);
assert.deepEqual(modelApi.normalize({ type: "adigun-document", version: 2, content: model.content }).content, []);
process.stdout.write("Document model tests passed: schema versioning, formatting, table spans, text escaping, and unsafe link/image rejection.\n");

