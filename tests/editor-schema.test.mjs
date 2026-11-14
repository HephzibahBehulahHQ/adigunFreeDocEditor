import assert from "node:assert/strict";
import { EditorState } from "@tiptap/pm/state";
import {
  createEditorSchema,
  documentModelToEditorJSON,
  editorJSONToDocumentModel,
} from "../src/editor-schema.js";

globalThis.window = {};
globalThis.location = { href: "https://adigunfreedoceditor.hephzibahbehulah.com/" };
await import("../document-model.js");
const modelApi = window.AdigunDocumentModel;

const text = (value) => ({ type: "text", text: value });
const element = (tag, attrs = {}, children = []) => ({ type: "element", tag, attrs, children });
const fixture = modelApi.normalize({
  type: "adigun-document",
  version: 1,
  content: [
    element("p", { align: "center", "data-indent-level": "2", "data-line-spacing": "1.5", "data-paragraph-spacing": "12" }, [
      element("span", { "data-font-family": "Georgia", "data-text-color": "#C00000", "data-highlight-color": "#FFFF00" }, [
        element("strong", {}, [text("Styled text")]),
      ]),
      text(" "),
      element("a", { href: "https://example.com/" }, [text("link")]),
      text(" "),
      element("u", {}, [text("underlined")]),
      text(" "),
      element("s", {}, [text("struck")]),
      text(" "),
      element("code", {}, [text("code")]),
      text(" "),
      element("ins", { "data-revision-id": "rev-insert-1", "data-revision-author": "Editor", "data-revision-created-at": "1762992000000" }, [text("inserted")]),
      text(" "),
      element("del", { "data-revision-id": "rev-delete-1", "data-revision-author": "Editor", "data-revision-created-at": "1762992000001" }, [text("deleted")]),
      element("br"),
      element("img", { src: "data:image/png;base64,aGVsbG8=", alt: "Diagram", width: 120, height: 80 }),
    ]),
    element("h6", { align: "right", "data-indent-level": "1" }, [text("Level six heading")]),
    element("ul", {}, [
      element("li", {}, [element("p", {}, [text("List item")]), element("ol", { start: 3 }, [element("li", {}, [element("p", {}, [text("Nested item")])])])]),
    ]),
    element("blockquote", {}, [element("p", {}, [text("Quoted text")])]),
    element("pre", {}, [element("code", {}, [text("const answer = 42;")])]),
    element("table", {}, [
      element("thead", { "data-page-header-copy": "true" }, [element("tr", {}, [element("th", { colspan: 2 }, [element("p", {}, [text("Column heading")])])])]),
      element("tbody", {}, [element("tr", {}, [element("td", { rowspan: 2 }, [element("p", { "data-paragraph-spacing": "6" }, [text("Merged cell")])]), element("td", {}, [element("p", {}, [text("Cell")])])])]),
      element("tfoot", {}, [element("tr", {}, [element("td", {}, [element("p", {}, [text("Footer")])])])]),
    ]),
    element("hr", { "data-page-break": "true" }),
  ],
});

const schema = createEditorSchema();
const editorJSON = documentModelToEditorJSON(fixture);
const editorDocument = schema.nodeFromJSON(editorJSON);
editorDocument.check();
function containsNode(predicate) {
  let found = false;
  editorDocument.descendants((node) => { if (predicate(node)) { found = true; return false; } return !found; });
  return found;
}
assert.equal(editorDocument.textContent.includes("Level six heading"), true, "all six heading levels are accepted");
assert.equal(editorDocument.textContent.includes("const answer = 42;"), true, "preformatted text survives the schema mapping");
assert.ok(containsNode((node) => node.type.name === "image" && node.attrs.alt === "Diagram"));
assert.ok(containsNode((node) => node.type.name === "tableCell" && node.attrs.rowspan === 2));
assert.ok(containsNode((node) => node.type.name === "tableRow" && node.attrs.section === "tfoot"));
assert.ok(containsNode((node) => node.type.name === "table" && node.attrs.pageHeaderCopy));
assert.ok(containsNode((node) => node.type.name === "horizontalRule" && node.attrs.pageBreak));
assert.ok(editorDocument.rangeHasMark(0, editorDocument.content.size, schema.marks.trackedInsertion));
assert.ok(editorDocument.rangeHasMark(0, editorDocument.content.size, schema.marks.trackedDeletion));

const normalizedRoundTrip = modelApi.normalize(editorJSONToDocumentModel(editorDocument.toJSON()));
const restoredDocument = schema.nodeFromJSON(documentModelToEditorJSON(normalizedRoundTrip));
assert.ok(editorDocument.eq(restoredDocument), "model nodes, marks, table sections, and supported custom attributes round-trip through the editor schema");
const roundTripHtml = modelApi.toHTML(normalizedRoundTrip);
assert.match(roundTripHtml, /data-indent-level="2"/);
assert.match(roundTripHtml, /data-font-family="Georgia"/);
assert.match(roundTripHtml, /data-revision-created-at="1762992000000"/);
assert.match(roundTripHtml, /rowspan="2"/);
assert.match(roundTripHtml, /data-page-break="true"/);
const roundTripTable = normalizedRoundTrip.content.find((node) => node.tag === "table");
assert.equal(roundTripTable.children.find((node) => node.tag === "thead").attrs["data-page-header-copy"], "true");

const initialState = EditorState.create({ schema, doc: editorDocument });
const transaction = initialState.tr.insertText("New ", 1);
const updatedState = initialState.apply(transaction);
assert.ok(updatedState.doc.textContent.startsWith("New Styled text"), "schema-backed transactions update the document tree");

process.stdout.write("Editor schema tests passed: supported model structures and attributes round-trip, and transactions update document state.\n");

