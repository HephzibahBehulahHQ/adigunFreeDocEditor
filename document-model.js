(() => {
  const format = "adigun-document";
  const version = 1;
  const allowedTags = new Set([
    "p", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "u", "s", "strike", "del", "ins",
    "ul", "ol", "li", "span", "a", "br", "hr", "blockquote", "pre", "code", "table", "thead", "tbody",
    "tfoot", "tr", "th", "td", "img",
  ]);
  const voidTags = new Set(["br", "hr", "img"]);
  const paragraphTags = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "th", "td"]);
  const pageFlowTags = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "table"]);
  const lineSpacingValues = new Set(["1", "1.15", "1.5", "2"]);
  const paragraphSpacingValues = new Set(["0", "6", "12"]);
  const fontFamilies = new Set(["Arial", "Calibri", "Cambria", "Courier New", "Georgia", "Tahoma", "Times New Roman", "Verdana"]);
  const supportedColors = new Set(["#000000", "#404040", "#C00000", "#ED7D31", "#FFC000", "#548235", "#4472C4", "#7030A0", "#00B0F0", "#FFFFFF", "#FFFF00", "#00FF00", "#00FFFF", "#FF00FF", "#0000FF", "#FF0000", "#000080", "#008080", "#008000", "#800080", "#800000", "#808000", "#808080", "#C0C0C0"]);

  function supportedFontFamily(value) {
    const name = String(value || "").split(",")[0].trim().replace(/^["\']|["\']$/g, "");
    return [...fontFamilies].find((family) => family.toLowerCase() === name.toLowerCase()) || "";
  }

  function supportedColor(value) {
    const source = String(value || "").trim();
    let match = source.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
    if (match && match[1].length === 3) return supportedColor("#" + [...match[1]].map((digit) => digit + digit).join(""));
    if (!match) {
      match = source.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i);
      if (!match || match.slice(1, 4).some((channel) => Number(channel) > 255) || match[4] && Number(match[4]) < 1) return "";
      return supportedColor("#" + match.slice(1, 4).map((channel) => Number(channel).toString(16).padStart(2, "0")).join(""));
    }
    const color = source.toUpperCase();
    return supportedColors.has(color) ? color : "";
  }
  const imageSource = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/]+={0,2}$/i;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function safeAttributes(tag, attributes = {}) {
    const result = {};
    if (tag === "a" && typeof attributes.href === "string") {
      try {
        const url = new URL(attributes.href, location.href);
        if (["http:", "https:", "mailto:"].includes(url.protocol)) result.href = url.href;
      } catch { /* Invalid links are omitted from the document model. */ }
    }
    if (["ins", "del"].includes(tag) && typeof attributes["data-revision-id"] === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(attributes["data-revision-id"])) {
      result["data-revision-id"] = attributes["data-revision-id"];
      if (typeof attributes["data-revision-author"] === "string") result["data-revision-author"] = attributes["data-revision-author"].slice(0, 80);
      const createdAt = Number(attributes["data-revision-created-at"]);
      if (Number.isFinite(createdAt) && createdAt > 0 && createdAt <= 8640000000000000) result["data-revision-created-at"] = String(Math.floor(createdAt));
    }
    if (tag === "img" && typeof attributes.src === "string" && attributes.src.length <= 11 * 1024 * 1024 && imageSource.test(attributes.src)) {
      result.src = attributes.src;
      if (typeof attributes.alt === "string") result.alt = attributes.alt.slice(0, 300);
      for (const dimension of ["width", "height"]) {
        const value = Number(attributes[dimension]);
        if (Number.isInteger(value) && value > 0 && value <= 4096) result[dimension] = value;
      }
    }
    if (tag === "span") {
      const fontFamily = supportedFontFamily(attributes["data-font-family"]);
      if (fontFamily) result["data-font-family"] = fontFamily;
      for (const name of ["data-text-color", "data-highlight-color"]) {
        const color = supportedColor(attributes[name]);
        if (color) result[name] = color;
      }
    }
    if (["th", "td"].includes(tag)) {
      for (const dimension of ["colspan", "rowspan"]) {
        const value = Number(attributes[dimension]);
        if (Number.isInteger(value) && value > 1 && value <= 50) result[dimension] = value;
      }
    }
    if (tag === "hr" && attributes["data-page-break"] === "true") result["data-page-break"] = "true";
    if (tag === "thead" && attributes["data-page-header-copy"] === "true") result["data-page-header-copy"] = "true";
    if (tag === "ol") {
      const start = Number(attributes.start);
      if (Number.isInteger(start) && start > 1 && start <= 100000) result.start = start;
    }
    if (pageFlowTags.has(tag) && typeof attributes["data-page-flow-id"] === "string" && /^[\da-f-]{1,80}$/i.test(attributes["data-page-flow-id"])) result["data-page-flow-id"] = attributes["data-page-flow-id"];
    if (paragraphTags.has(tag)) {
      const indentLevel = Number(attributes["data-indent-level"]);
      if (Number.isInteger(indentLevel) && indentLevel >= 1 && indentLevel <= 4) result["data-indent-level"] = String(indentLevel);
      if (lineSpacingValues.has(String(attributes["data-line-spacing"]))) result["data-line-spacing"] = String(attributes["data-line-spacing"]);
      if (paragraphSpacingValues.has(String(attributes["data-paragraph-spacing"]))) result["data-paragraph-spacing"] = String(attributes["data-paragraph-spacing"]);
      if (["left", "center", "right", "justify"].includes(attributes.align)) result.align = attributes.align;
    }
    return result;
  }

  function normalizeNode(node) {
    if (!node || typeof node !== "object") return null;
    if (node.type === "text") return { type: "text", text: typeof node.text === "string" ? node.text : "" };
    const tag = String(node.tag || "").toLowerCase();
    if (!allowedTags.has(tag)) return null;
    const attrs = safeAttributes(tag, node.attrs);
    if (tag === "img" && !attrs.src) return null;
    return {
      type: "element",
      tag,
      attrs,
      children: voidTags.has(tag) ? [] : (Array.isArray(node.children) ? node.children.map(normalizeNode).filter(Boolean) : []),
    };
  }

  function normalize(model) {
    return {
      type: format,
      version,
      content: model?.type === format && model.version === version && Array.isArray(model.content) ? model.content.map(normalizeNode).filter(Boolean) : [],
    };
  }

  function copyDomNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return { type: "text", text: node.nodeValue };
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const sourceTag = node.tagName.toLowerCase();
    const tag = sourceTag === "font" ? "span" : sourceTag;
    const attrs = {};
    for (const name of ["href", "src", "alt", "width", "height", "colspan", "rowspan", "start", "data-page-break", "data-page-flow-id", "data-page-header-copy", "data-font-family", "data-text-color", "data-highlight-color", "data-line-spacing", "data-paragraph-spacing", "data-indent-level", "data-revision-id", "data-revision-author", "data-revision-created-at"]) {
      const value = node.getAttribute(name);
      if (value !== null) attrs[name] = value;
    }
    if (tag === "span") {
      const family = supportedFontFamily(sourceTag === "font" ? node.getAttribute("face") : node.getAttribute("data-font-family") || node.style?.fontFamily);
      if (family) attrs["data-font-family"] = family;
      const textColor = supportedColor(sourceTag === "font" ? node.getAttribute("color") : node.getAttribute("data-text-color") || node.style?.color);
      if (textColor) attrs["data-text-color"] = textColor;
      const highlightColor = supportedColor(node.getAttribute("data-highlight-color") || node.style?.backgroundColor || node.style?.background);
      if (highlightColor) attrs["data-highlight-color"] = highlightColor;
    }
    if (paragraphTags.has(tag)) attrs.align = node.style?.textAlign || "";
    if (!allowedTags.has(tag)) return [...node.childNodes].map(copyDomNode).filter(Boolean);
    const normalized = normalizeNode({ type: "element", tag, attrs, children: [...node.childNodes].map(copyDomNode).flat().filter(Boolean) });
    return normalized;
  }

  function fromDOM(root) {
    const content = [...root.childNodes].map(copyDomNode).flat().filter(Boolean);
    const merged = [];
    let previousFlowId = "";
    for (const node of content) {
      const flowId = node.type === "element" && pageFlowTags.has(node.tag) ? node.attrs["data-page-flow-id"] || "" : "";
      if (flowId && flowId === previousFlowId) {
        const additions = node.tag === "table" ? node.children.filter((child) => !(child.type === "element" && child.tag === "thead" && child.attrs["data-page-header-copy"] === "true")) : node.children;
        merged[merged.length - 1].children.push(...additions);
      }
      else merged.push(node);
      previousFlowId = flowId;
    }
    const mergeNestedListItemFlows = (node) => {
      if (node.type !== "element") return;
      node.children.forEach(mergeNestedListItemFlows);
      if (!["ul", "ol"].includes(node.tag)) return;
      const children = [];
      let previousItem = null;
      for (const child of node.children) {
        const flowId = child.type === "element" && child.tag === "li" ? child.attrs["data-page-flow-id"] || "" : "";
        if (flowId && flowId === previousItem?.attrs["data-page-flow-id"]) {
          previousItem.children.push(...child.children);
        } else {
          children.push(child);
          previousItem = child.type === "element" && child.tag === "li" ? child : null;
        }
      }
      node.children = children;
    };
    const stripPageFlowIds = (node) => {
      if (node.type !== "element") return;
      delete node.attrs["data-page-flow-id"];
      node.children.forEach(stripPageFlowIds);
    };
    for (const node of merged) {
      mergeNestedListItemFlows(node);
      stripPageFlowIds(node);
    }
    return normalize({ type: format, version, content: merged });
  }

  function fromHTML(html) {
    const parsed = new DOMParser().parseFromString(`<main>${String(html || "")}</main>`, "text/html");
    return fromDOM(parsed.querySelector("main"));
  }

  function renderNode(input) {
    if (input.type === "text") return escapeHtml(input.text);
    const attributes = { ...input.attrs };
    delete attributes["data-page-flow-id"];
    delete attributes["data-page-header-copy"];
    const styles = [];
    if (attributes.align) { styles.push(`text-align:${attributes.align}`); delete attributes.align; }
    if (paragraphTags.has(input.tag)) {
      if (attributes["data-indent-level"]) styles.push(`margin-left:${Number(attributes["data-indent-level"]) * 36}pt`);
      if (attributes["data-line-spacing"]) styles.push(`line-height:${attributes["data-line-spacing"]}`);
      if (attributes["data-paragraph-spacing"]) styles.push(`margin-bottom:${attributes["data-paragraph-spacing"]}pt`);
    }
    if (input.tag === "span") {
      if (attributes["data-font-family"]) styles.push(`font-family:${attributes["data-font-family"]}`);
      if (attributes["data-text-color"]) styles.push(`color:${attributes["data-text-color"]}`);
      if (attributes["data-highlight-color"]) styles.push(`background-color:${attributes["data-highlight-color"]}`);
    }
    if (styles.length) attributes.style = styles.join(";");
    const serializedAttributes = Object.entries(attributes).map(([name, value]) => ` ${name}="${escapeHtml(value)}"`).join("");
    if (voidTags.has(input.tag)) return `<${input.tag}${serializedAttributes}>`;
    return `<${input.tag}${serializedAttributes}>${input.children.map(renderNode).join("")}</${input.tag}>`;
  }

  function toHTML(model) {
    const safeModel = normalize(model);
    return safeModel.content.map(renderNode).join("");
  }

  window.AdigunDocumentModel = Object.freeze({ format, version, fromDOM, fromHTML, normalize, toHTML });
})();

