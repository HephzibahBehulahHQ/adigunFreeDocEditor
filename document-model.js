(() => {
  const format = "adigun-document";
  const version = 1;
  const allowedTags = new Set([
    "p", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "u", "s", "strike", "del",
    "ul", "ol", "li", "a", "br", "hr", "blockquote", "pre", "code", "table", "thead", "tbody",
    "tfoot", "tr", "th", "td", "img",
  ]);
  const voidTags = new Set(["br", "hr", "img"]);
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
    if (tag === "img" && typeof attributes.src === "string" && attributes.src.length <= 11 * 1024 * 1024 && imageSource.test(attributes.src)) {
      result.src = attributes.src;
      if (typeof attributes.alt === "string") result.alt = attributes.alt.slice(0, 300);
      for (const dimension of ["width", "height"]) {
        const value = Number(attributes[dimension]);
        if (Number.isInteger(value) && value > 0 && value <= 4096) result[dimension] = value;
      }
    }
    if (["th", "td"].includes(tag)) {
      for (const dimension of ["colspan", "rowspan"]) {
        const value = Number(attributes[dimension]);
        if (Number.isInteger(value) && value > 1 && value <= 50) result[dimension] = value;
      }
    }
    if (tag === "ol") {
      const start = Number(attributes.start);
      if (Number.isInteger(start) && start > 1 && start <= 100000) result.start = start;
    }
    if (["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "th", "td"].includes(tag) && ["left", "center", "right", "justify"].includes(attributes.align)) result.align = attributes.align;
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
    const tag = node.tagName.toLowerCase();
    const attrs = {};
    for (const name of ["href", "src", "alt", "width", "height", "colspan", "rowspan", "start"]) {
      const value = node.getAttribute(name);
      if (value !== null) attrs[name] = value;
    }
    if (["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "th", "td"].includes(tag)) attrs.align = node.style?.textAlign || "";
    if (!allowedTags.has(tag)) return [...node.childNodes].map(copyDomNode).filter(Boolean);
    const normalized = normalizeNode({ type: "element", tag, attrs, children: [...node.childNodes].map(copyDomNode).flat().filter(Boolean) });
    return normalized;
  }

  function fromDOM(root) {
    return normalize({ type: format, version, content: [...root.childNodes].map(copyDomNode).flat().filter(Boolean) });
  }

  function fromHTML(html) {
    const parsed = new DOMParser().parseFromString(`<main>${String(html || "")}</main>`, "text/html");
    return fromDOM(parsed.querySelector("main"));
  }

  function renderNode(input) {
    if (input.type === "text") return escapeHtml(input.text);
    const attributes = { ...input.attrs };
    if (attributes.align) { attributes.style = `text-align:${attributes.align}`; delete attributes.align; }
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

