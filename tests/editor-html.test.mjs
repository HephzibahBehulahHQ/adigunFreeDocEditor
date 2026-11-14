import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { generateHTML, generateJSON } from "@tiptap/core";
import {
  editorExtensions,
  createEditorSchema,
  documentModelToEditorJSON,
  editorJSONToDocumentModel,
} from "../src/editor-schema.js";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.test/" });
for (const key of ["window", "document", "DOMParser", "Node", "Element", "HTMLElement", "location"]) {
  globalThis[key] = key === "window" ? dom.window : key === "document" ? dom.window.document : dom.window[key];
}
await import("../document-model.js");
const modelApi = window.AdigunDocumentModel;

const text = (value) => ({ type: "text", text: value });
const element = (tag, attrs = {}, children = []) => ({ type: "element", tag, attrs, children });
const fixture = modelApi.normalize({
  type: "adigun-document",
  version: 1,
  content: [
    element("p", { align: "center", "data-indent-level": "2", "data-line-spacing": "1.5", "data-paragraph-spacing": "12" }, [
      element("span", { "data-font-family": "Georgia", "data-font-size": "14pt", "data-text-color": "#C00000", "data-highlight-color": "#FFFF00" }, [element("strong", {}, [text("Styled text")])]),
      text(" "), element("a", { href: "https://example.com/" }, [text("link")]), text(" "),
      element("ins", { "data-revision-id": "rev-1", "data-revision-author": "Editor", "data-revision-created-at": "1762992000000" }, [text("inserted")]),
      text(" "), element("del", { "data-revision-id": "rev-2", "data-revision-author": "Editor", "data-revision-created-at": "1762992000001" }, [text("deleted")]),
      element("br"), element("img", { src: "data:image/png;base64,aGVsbG8=", alt: "Diagram", width: 120, height: 80 }),
    ]),
    element("table", {}, [
      element("thead", { "data-page-header-copy": "true" }, [element("tr", {}, [element("th", { colspan: 2 }, [element("p", {}, [text("Column heading")])])])]),
      element("tbody", {}, [element("tr", {}, [element("td", { rowspan: 2 }, [element("p", {}, [text("Merged cell")])]), element("td", {}, [element("p", {}, [text("Cell")])])])]),
      element("tfoot", {}, [element("tr", {}, [element("td", {}, [element("p", {}, [text("Footer")])])])]),
    ]),
    element("hr", { "data-page-break": "true" }),
  ],
});

const schema = createEditorSchema();
const source = schema.nodeFromJSON(documentModelToEditorJSON(fixture));
const html = generateHTML(source.toJSON(), editorExtensions);
const parsed = schema.nodeFromJSON(generateJSON(html, editorExtensions));
assert.ok(source.eq(parsed), "Tiptap HTML generation and parsing preserve the supported schema document");

const roundTripModel = modelApi.normalize(editorJSONToDocumentModel(parsed.toJSON()));
const table = roundTripModel.content.find((node) => node.tag === "table");
assert.equal(table.children.find((node) => node.tag === "thead").attrs["data-page-header-copy"], "true");
assert.deepEqual(table.children.map((node) => node.tag), ["thead", "tbody", "tfoot"]);
const exported = modelApi.toHTML(roundTripModel);
for (const marker of ["data-indent-level=\"2\"", "data-revision-id=\"rev-1\"", "rowspan=\"2\"", "data-page-break=\"true\""]) {
  assert.ok(exported.includes(marker), `canonical export preserves ${marker}`);
}
process.stdout.write("Editor HTML tests passed: supported model structures and metadata round-trip through Tiptap HTML parsing and serialization.\n");
