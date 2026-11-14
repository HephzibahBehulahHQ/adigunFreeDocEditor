import { Extension, Mark, Node, getSchema, mergeAttributes } from "@tiptap/core";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import StarterKit from "@tiptap/starter-kit";

const modelFormat = "adigun-document";
const paragraphTypes = ["paragraph", "heading", "listItem", "tableCell", "tableHeader"];
const blockTypes = new Set(["paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock", "horizontalRule", "table", "tableRow", "tableCell", "tableHeader"]);
const inlineTypes = new Set(["text", "image", "hardBreak"]);

const ModelTextStyle = TextStyle.extend({
  addAttributes() {
    const attribute = (dataName, styleName) => ({
      default: null,
      parseHTML: (element) => element.getAttribute(dataName) || element.style?.getPropertyValue(styleName) || null,
      renderHTML: (attrs) => attrs[dataName === "data-font-family" ? "fontFamily" : dataName === "data-text-color" ? "textColor" : "highlightColor"]
        ? { [dataName]: attrs[dataName === "data-font-family" ? "fontFamily" : dataName === "data-text-color" ? "textColor" : "highlightColor"] }
        : {},
    });
    return {
      ...this.parent?.(),
      fontFamily: attribute("data-font-family", "font-family"),
      textColor: attribute("data-text-color", "color"),
      highlightColor: attribute("data-highlight-color", "background-color"),
    };
  },
  renderHTML({ HTMLAttributes }) {
    const styles = [
      HTMLAttributes["data-font-family"] && `font-family:${HTMLAttributes["data-font-family"]}`,
      HTMLAttributes["data-text-color"] && `color:${HTMLAttributes["data-text-color"]}`,
      HTMLAttributes["data-highlight-color"] && `background-color:${HTMLAttributes["data-highlight-color"]}`,
    ].filter(Boolean).join(";");
    const attrs = {
      "data-font-family": HTMLAttributes["data-font-family"] || null,
      "data-text-color": HTMLAttributes["data-text-color"] || null,
      "data-highlight-color": HTMLAttributes["data-highlight-color"] || null,
      style: styles || null,
    };
    return ["span", mergeAttributes(HTMLAttributes, attrs), 0];
  },
});

const ModelAttributes = Extension.create({
  name: "adigunModelAttributes",
  addGlobalAttributes() {
    const paragraphAttributes = {
      indentLevel: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-indent-level"),
        renderHTML: (attrs) => attrs.indentLevel ? { "data-indent-level": String(attrs.indentLevel) } : {},
      },
      lineSpacing: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-line-spacing"),
        renderHTML: (attrs) => attrs.lineSpacing ? { "data-line-spacing": String(attrs.lineSpacing) } : {},
      },
      paragraphSpacing: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-paragraph-spacing"),
        renderHTML: (attrs) => attrs.paragraphSpacing ? { "data-paragraph-spacing": String(attrs.paragraphSpacing) } : {},
      },
    };
    return [
      { types: paragraphTypes, attributes: paragraphAttributes },
      {
        types: ["tableRow"],
        attributes: {
          section: {
            default: "tbody",
            parseHTML: (element) => element.getAttribute("data-adigun-section") || element.parentElement?.tagName.toLowerCase() || "tbody",
            renderHTML: (attrs) => attrs.section && attrs.section !== "tbody" ? { "data-adigun-section": attrs.section } : {},
          },
        },
      },
      {
        types: ["table"],
        attributes: {
          pageHeaderCopy: {
            default: false,
            parseHTML: (element) => element.getAttribute("data-adigun-page-header-copy") === "true" || element.querySelector("thead[data-page-header-copy='true']") !== null,
            renderHTML: (attrs) => attrs.pageHeaderCopy ? { "data-adigun-page-header-copy": "true" } : {},
          },
        },
      },
      {
        types: ["horizontalRule"],
        attributes: {
          pageBreak: {
            default: false,
            parseHTML: (element) => element.getAttribute("data-page-break") === "true",
            renderHTML: (attrs) => attrs.pageBreak ? { "data-page-break": "true" } : {},
          },
        },
      },
    ];
  },
});

function revisionMark(name, tag) {
  return Mark.create({
    name,
    priority: 1000,
    inclusive: false,
    addAttributes() {
      return {
        revisionId: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-revision-id"),
          renderHTML: (attrs) => attrs.revisionId ? { "data-revision-id": attrs.revisionId } : {},
        },
        revisionAuthor: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-revision-author"),
          renderHTML: (attrs) => attrs.revisionAuthor ? { "data-revision-author": attrs.revisionAuthor } : {},
        },
        revisionCreatedAt: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-revision-created-at"),
          renderHTML: (attrs) => attrs.revisionCreatedAt ? { "data-revision-created-at": String(attrs.revisionCreatedAt) } : {},
        },
      };
    },
    parseHTML: () => [{ tag }],
    renderHTML: ({ HTMLAttributes }) => [tag, mergeAttributes(HTMLAttributes), 0],
  });
}

const TrackedInsertion = revisionMark("trackedInsertion", "ins");
const TrackedDeletion = revisionMark("trackedDeletion", "del");

const DocumentSheet = Node.create({
  name: "documentSheet",
  group: "block",
  content: "(paragraph|heading|bulletList|orderedList|blockquote|codeBlock|horizontalRule|table)+",
  defining: true,
  selectable: false,
  priority: 1000,
  addAttributes() {
    return {
      pageLabel: {
        default: null,
        parseHTML: (element) => element.getAttribute("aria-label"),
        renderHTML: (attrs) => attrs.pageLabel ? { "aria-label": attrs.pageLabel } : {},
      },
    };
  },
  parseHTML: () => [{ tag: "div.document-sheet", priority: 1000 }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes({
    class: "document-sheet",
    "data-editor-page": "true",
    role: "group",
  }, HTMLAttributes), 0],
});

export const editorExtensions = [
  DocumentSheet,
  StarterKit.configure({ link: false, heading: { levels: [1, 2, 3, 4, 5, 6] } }),
  TableKit,
  Image.configure({ inline: true, allowBase64: true }),
  Link.configure({ openOnClick: false, autolink: false, linkOnPaste: false }),
  ModelTextStyle,
  TextAlign.configure({ types: paragraphTypes }),
  ModelAttributes,
  TrackedInsertion,
  TrackedDeletion,
];

export function createEditorSchema() {
  return getSchema(editorExtensions);
}

function mergeMark(marks, mark) {
  const index = marks.findIndex((item) => item.type === mark.type);
  if (index < 0) return [...marks, mark];
  const result = [...marks];
  result[index] = { ...result[index], attrs: { ...result[index].attrs, ...mark.attrs } };
  return result;
}

function modelAttrsToEditor(attrs = {}) {
  return {
    textAlign: attrs.align || null,
    indentLevel: attrs["data-indent-level"] || null,
    lineSpacing: attrs["data-line-spacing"] || null,
    paragraphSpacing: attrs["data-paragraph-spacing"] || null,
  };
}

function inlineMarkForTag(tag, attrs = {}) {
  if (["strong", "b"].includes(tag)) return { type: "bold" };
  if (["em", "i"].includes(tag)) return { type: "italic" };
  if (["u"].includes(tag)) return { type: "underline" };
  if (["s", "strike"].includes(tag)) return { type: "strike" };
  if (tag === "code") return { type: "code" };
  if (tag === "a") return { type: "link", attrs: { href: attrs.href || null } };
  if (tag === "ins") return { type: "trackedInsertion", attrs: {
    revisionId: attrs["data-revision-id"] || null,
    revisionAuthor: attrs["data-revision-author"] || null,
    revisionCreatedAt: attrs["data-revision-created-at"] || null,
  } };
  if (tag === "del") return { type: "trackedDeletion", attrs: {
    revisionId: attrs["data-revision-id"] || null,
    revisionAuthor: attrs["data-revision-author"] || null,
    revisionCreatedAt: attrs["data-revision-created-at"] || null,
  } };
  if (tag === "span") {
    const styleAttrs = {
      fontFamily: attrs["data-font-family"] || null,
      textColor: attrs["data-text-color"] || null,
      highlightColor: attrs["data-highlight-color"] || null,
    };
    if (Object.values(styleAttrs).some(Boolean)) return { type: "textStyle", attrs: styleAttrs };
  }
  return null;
}

function childrenToEditor(children = [], marks = []) {
  return children.flatMap((child) => modelNodeToEditor(child, marks));
}

function ensureEditorBlocks(nodes) {
  const result = [];
  let inline = [];
  const flushInline = () => {
    if (!inline.length) return;
    result.push({ type: "paragraph", attrs: modelAttrsToEditor(), content: inline });
    inline = [];
  };
  for (const node of nodes) {
    if (blockTypes.has(node.type)) {
      flushInline();
      result.push(node);
    } else if (inlineTypes.has(node.type)) inline.push(node);
  }
  flushInline();
  return result;
}

function modelPlainText(node) {
  if (node?.type === "text") return node.text || "";
  return (node?.children || []).map(modelPlainText).join("");
}

function modelNodeToEditor(node, marks = []) {
  if (node?.type === "text") return node.text ? [{ type: "text", text: node.text, ...(marks.length ? { marks } : {}) }] : [];
  if (node?.type !== "element") return [];
  const { tag, attrs = {}, children = [] } = node;
  const inlineMark = inlineMarkForTag(tag, attrs);
  if (inlineMark) return childrenToEditor(children, mergeMark(marks, inlineMark));

  if (tag === "img") return [{ type: "image", attrs: {
    src: attrs.src,
    alt: attrs.alt || null,
    width: attrs.width ? Number(attrs.width) : null,
    height: attrs.height ? Number(attrs.height) : null,
  }, ...(marks.length ? { marks } : {}) }];
  if (tag === "br") return [{ type: "hardBreak", ...(marks.length ? { marks } : {}) }];
  if (tag === "hr") return [{ type: "horizontalRule", attrs: { pageBreak: attrs["data-page-break"] === "true" } }];
  if (tag === "p") return [{ type: "paragraph", attrs: modelAttrsToEditor(attrs), content: childrenToEditor(children, marks) }];
  if (/^h[1-6]$/.test(tag)) return [{ type: "heading", attrs: { ...modelAttrsToEditor(attrs), level: Number(tag.slice(1)) }, content: childrenToEditor(children, marks) }];
  if (tag === "ul") return [{ type: "bulletList", content: ensureEditorBlocks(childrenToEditor(children, marks)) }];
  if (tag === "ol") return [{ type: "orderedList", attrs: { start: attrs.start ? Number(attrs.start) : 1 }, content: ensureEditorBlocks(childrenToEditor(children, marks)) }];
  if (tag === "li") return [{ type: "listItem", attrs: modelAttrsToEditor(attrs), content: ensureEditorBlocks(childrenToEditor(children, marks)) }];
  if (tag === "blockquote") return [{ type: "blockquote", content: ensureEditorBlocks(childrenToEditor(children, marks)) }];
  if (tag === "pre") return [{ type: "codeBlock", content: [{ type: "text", text: children.map(modelPlainText).join("") }] }];
  if (tag === "table") {
    const sections = children.filter((child) => child.type === "element" && ["thead", "tbody", "tfoot"].includes(child.tag));
    const rows = sections.length
      ? sections.flatMap((section) => section.children.filter((row) => row.type === "element" && row.tag === "tr").map((row) => modelNodeToEditor(row, marks).map((mapped) => ({ ...mapped, attrs: { ...mapped.attrs, section: section.tag } })).flat()).flat())
      : children.filter((child) => child.type === "element" && child.tag === "tr").flatMap((row) => modelNodeToEditor(row, marks).map((mapped) => ({ ...mapped, attrs: { ...mapped.attrs, section: "tbody" } })));
    const headerCopy = sections.some((section) => section.tag === "thead" && section.attrs?.["data-page-header-copy"] === "true");
    return [{ type: "table", attrs: { pageHeaderCopy: headerCopy }, content: rows }];
  }
  if (tag === "tr") return [{ type: "tableRow", attrs: { section: "tbody" }, content: childrenToEditor(children, marks) }];
  if (tag === "th" || tag === "td") return [{
    type: tag === "th" ? "tableHeader" : "tableCell",
    attrs: { ...modelAttrsToEditor(attrs), colspan: attrs.colspan ? Number(attrs.colspan) : 1, rowspan: attrs.rowspan ? Number(attrs.rowspan) : 1 },
    content: ensureEditorBlocks(childrenToEditor(children, marks)),
  }];
  return childrenToEditor(children, marks);
}

export function documentModelToEditorJSON(model) {
  if (model?.type !== modelFormat || !Array.isArray(model.content)) throw new TypeError("Expected a normalized Adigun document model.");
  const content = ensureEditorBlocks(childrenToEditor(model.content));
  return { type: "doc", content: content.length ? content : [{ type: "paragraph", attrs: modelAttrsToEditor(), content: [] }] };
}

function editorAttrsToModel(attrs = {}) {
  const result = {};
  if (attrs.textAlign) result.align = attrs.textAlign;
  if (attrs.indentLevel) result["data-indent-level"] = String(attrs.indentLevel);
  if (attrs.lineSpacing) result["data-line-spacing"] = String(attrs.lineSpacing);
  if (attrs.paragraphSpacing) result["data-paragraph-spacing"] = String(attrs.paragraphSpacing);
  return result;
}

function markToModel(mark) {
  const attrs = mark.attrs || {};
  switch (mark.type) {
    case "bold": return { tag: "strong", attrs: {} };
    case "italic": return { tag: "em", attrs: {} };
    case "underline": return { tag: "u", attrs: {} };
    case "strike": return { tag: "s", attrs: {} };
    case "code": return { tag: "code", attrs: {} };
    case "link": return { tag: "a", attrs: attrs.href ? { href: attrs.href } : {} };
    case "textStyle": return { tag: "span", attrs: Object.fromEntries([
      ["data-font-family", attrs.fontFamily], ["data-text-color", attrs.textColor], ["data-highlight-color", attrs.highlightColor],
    ].filter(([, value]) => value)) };
    case "trackedInsertion": return { tag: "ins", attrs: Object.fromEntries([
      ["data-revision-id", attrs.revisionId], ["data-revision-author", attrs.revisionAuthor], ["data-revision-created-at", attrs.revisionCreatedAt],
    ].filter(([, value]) => value)) };
    case "trackedDeletion": return { tag: "del", attrs: Object.fromEntries([
      ["data-revision-id", attrs.revisionId], ["data-revision-author", attrs.revisionAuthor], ["data-revision-created-at", attrs.revisionCreatedAt],
    ].filter(([, value]) => value)) };
    default: return null;
  }
}

function wrapTextMarks(node, marks = []) {
  let current = node;
  for (const mark of marks) {
    const mapped = markToModel(mark);
    if (mapped) current = { type: "element", ...mapped, children: [current] };
  }
  return current;
}

function editorNodeToModel(node) {
  if (node.type === "documentSheet") return node.content.flatMap(editorNodeToModel);
  if (node.type === "text") return wrapTextMarks({ type: "text", text: node.text }, node.marks);
  if (node.type === "image") return { type: "element", tag: "img", attrs: Object.fromEntries([
    ["src", node.attrs.src], ["alt", node.attrs.alt], ["width", node.attrs.width], ["height", node.attrs.height],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "")), children: [] };
  if (node.type === "hardBreak") return { type: "element", tag: "br", attrs: {}, children: [] };
  if (node.type === "horizontalRule") return { type: "element", tag: "hr", attrs: node.attrs.pageBreak ? { "data-page-break": "true" } : {}, children: [] };

  const children = (node.content || []).map(editorNodeToModel);
  const attrs = editorAttrsToModel(node.attrs);
  switch (node.type) {
    case "paragraph": return { type: "element", tag: "p", attrs, children };
    case "heading": return { type: "element", tag: `h${node.attrs.level}`, attrs, children };
    case "bulletList": return { type: "element", tag: "ul", attrs: {}, children };
    case "orderedList": return { type: "element", tag: "ol", attrs: node.attrs.start > 1 ? { start: String(node.attrs.start) } : {}, children };
    case "listItem": return { type: "element", tag: "li", attrs, children };
    case "blockquote": return { type: "element", tag: "blockquote", attrs: {}, children };
    case "codeBlock": return { type: "element", tag: "pre", attrs: {}, children: [{ type: "text", text: (node.content || []).map((child) => child.text || "").join("") }] };
    case "table": {
      const groups = [];
      for (const row of node.content || []) {
        const section = ["thead", "tbody", "tfoot"].includes(row.attrs.section) ? row.attrs.section : "tbody";
        let group = groups[groups.length - 1];
        if (!group || group.tag !== section) { group = { tag: section, rows: [] }; groups.push(group); }
        group.rows.push(editorNodeToModel(row));
      }
      const sectionNodes = groups.map((group) => ({
        type: "element", tag: group.tag,
        attrs: group.tag === "thead" && node.attrs.pageHeaderCopy ? { "data-page-header-copy": "true" } : {},
        children: group.rows,
      }));
      return { type: "element", tag: "table", attrs: {}, children: sectionNodes };
    }
    case "tableRow": return { type: "element", tag: "tr", attrs: {}, children };
    case "tableCell": case "tableHeader": {
      const cellAttrs = { ...attrs };
      if (node.attrs.colspan > 1) cellAttrs.colspan = String(node.attrs.colspan);
      if (node.attrs.rowspan > 1) cellAttrs.rowspan = String(node.attrs.rowspan);
      return { type: "element", tag: node.type === "tableHeader" ? "th" : "td", attrs: cellAttrs, children };
    }
    default: throw new TypeError(`Unsupported editor node: ${node.type}`);
  }
}

export function editorJSONToDocumentModel(editorDocument) {
  const content = (editorDocument?.content || []).flatMap(editorNodeToModel);
  return { type: modelFormat, version: 1, content };
}

