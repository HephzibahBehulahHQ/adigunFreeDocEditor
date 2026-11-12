(() => {
  const $ = (selector) => document.querySelector(selector);
  const editor = $("#document");
  const titleInput = $("#document-title");
  const saveState = $("#save-state");
  const toast = $("#toast");
  const ribbon = $("#ribbon-tools");
  const assistant = $("#adigun-window");
  const filePicker = $("#file-picker");
  const DB_NAME = "adigunFreeDocEditor";
  let database;
  let activeId = crypto.randomUUID();
  let activeTab = "home";
  let saveTimer;
  let toastTimer;
  let zoom = 100;
  let pdfUrl;
  let activePdfFile;
  let pageOrientation = "portrait";
  let autosave = localStorage.getItem("adigun-autosave") !== "false";

  const toolsets = {
    home: [
      [{ label: "Undo", action: "undo", icon: "↶" }, { label: "Redo", action: "redo", icon: "↷" }],
      [{ label: "Text style", select: "block", options: [["p", "Normal"], ["h1", "Title"], ["h2", "Heading 1"], ["h3", "Heading 2"]] }, { label: "Font size", select: "size", options: [["3", "11"], ["4", "14"], ["5", "18"], ["6", "24"]] }],
      [{ label: "Bold", action: "bold", icon: "B", pressed: true }, { label: "Italic", action: "italic", icon: "I", pressed: true }, { label: "Underline", action: "underline", icon: "U", pressed: true }],
      [{ label: "Bulleted list", action: "insertUnorderedList", icon: "• List" }, { label: "Numbered list", action: "insertOrderedList", icon: "1. List" }],
      [{ label: "Align left", action: "justifyLeft", icon: "☰" }, { label: "Center", action: "justifyCenter", icon: "≡" }, { label: "Align right", action: "justifyRight", icon: "☷" }],
    ],
    insert: [
      [{ label: "Add link", action: "link", icon: "↗ Link" }, { label: "Remove link", action: "unlink", icon: "↗̸" }],
      [{ label: "Insert today's date", action: "date", icon: "▦ Date" }, { label: "Insert divider", action: "divider", icon: "― Divider" }],
    ],
    layout: [
      [{ label: "Page size", select: "paper", options: [["a4", "A4"], ["letter", "US Letter"]] }, { label: "Orientation", action: "orientation", icon: "▯ Portrait" }],
    ],
    review: [
      [{ label: "Spellcheck", action: "spellcheck", icon: "✓ Spellcheck", pressed: true }, { label: "Word count", action: "wordcount", icon: "# Word count" }],
    ],
    view: [
      [{ label: "Zoom out", action: "zoom-out", icon: "−" }, { label: "Zoom in", action: "zoom-in", icon: "+" }, { label: "Reset zoom", action: "zoom-reset", icon: "100%" }],
      [{ label: "Find in document", action: "find", icon: "⌕ Find" }, { label: "Toggle Adigun", action: "assistant", icon: "✧ Adigun" }],
    ],
  };

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return reject(new Error("This browser does not support local document storage."));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("documents", { keyPath: "id" });
      request.onsuccess = () => { database = request.result; resolve(database); };
      request.onerror = () => reject(request.error || new Error("Local storage could not be opened."));
    });
  }

  function notify(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
  }

  function setSaveStatus(label, saving = false) {
    saveState.lastChild.textContent = label;
    saveState.querySelector(".save-dot").style.background = saving ? "#d4af37" : "#38b778";
  }

  function title() {
    return titleInput.value.trim() || "Untitled document";
  }

  function countWords() {
    const isEditableDocument = editor.contentEditable === "true";
    const plainText = isEditableDocument ? editor.innerText.trim() : "";
    const words = plainText.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu) || [];
    $("#word-count").textContent = `${words.length} ${words.length === 1 ? "word" : "words"}`;
    $("#page-count").textContent = `Page ${Math.max(1, Math.ceil(editor.innerText.length / 3000))}`;
    $("#insight-words").textContent = isEditableDocument ? words.length.toLocaleString() : "—";
    $("#insight-characters").textContent = isEditableDocument ? plainText.length.toLocaleString() : "—";
    $("#insight-reading").textContent = isEditableDocument ? (words.length < 180 ? "<1 min" : `${Math.ceil(words.length / 180)} min`) : "—";
  }

  function saveDocument(force = false) {
    clearTimeout(saveTimer);
    if (!autosave && !force) { setSaveStatus("Autosave off"); return; }
    if (!database) { setSaveStatus("Local save unavailable"); return; }
    setSaveStatus("Saving…", true);
    saveTimer = setTimeout(() => {
      const tx = database.transaction("documents", "readwrite");
      tx.objectStore("documents").put({ id: activeId, title: title(), content: editor.innerHTML, updatedAt: Date.now(), kind: "document" });
      tx.oncomplete = () => { setSaveStatus("Saved"); countWords(); };
      tx.onerror = () => { setSaveStatus("Save failed"); notify("Could not save this document on your device."); };
    }, 280);
  }

  function setTitle(value) {
    titleInput.value = value || "Untitled document";
    $("#stage-title").textContent = title();
  }

  function setWorkspaceMode(mode) {
    const isDocument = mode === "document";
    editor.contentEditable = String(isDocument);
    titleInput.readOnly = !isDocument;
    $(".ribbon-tabs").hidden = !isDocument;
    ribbon.hidden = !isDocument;
    $("#undo").hidden = !isDocument;
    $("#redo").hidden = !isDocument;
    $("#export-html").hidden = mode === "list" || mode === "landing";
    $("#export-docx").hidden = !isDocument;
    $("#export-html").lastElementChild.textContent = mode === "pdf" ? "Download PDF" : "Export HTML";
  }

  function setMobileMenu(open) {
    const nav = $("#workspace-nav");
    const button = $("#mobile-menu");
    nav.classList.toggle("mobile-open", open);
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Close workspace menu" : "Open workspace menu");
  }

  function createDocument() {
    activePdfFile = undefined;
    if (pdfUrl) { URL.revokeObjectURL(pdfUrl); pdfUrl = undefined; }
    $("#pdf-frame")?.remove();
    activeId = crypto.randomUUID();
    setTitle("Untitled document");
    setWorkspaceMode("document");
    $("#file-kind").textContent = "New document";
    $("#editor-card").classList.remove("pdf-preview");
    $("#editor-card").classList.remove("landing");
    editor.hidden = false;
    editor.innerHTML = "<p><br></p>";
    editor.focus();
    countWords();
    saveDocument();
    notify("Blank document created.");
  }

  function getDocuments() {
    return new Promise((resolve, reject) => {
      const req = database.transaction("documents", "readonly").objectStore("documents").getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.updatedAt - a.updatedAt));
      req.onerror = () => reject(req.error);
    });
  }

  function showLanding() {
    activePdfFile = undefined;
    setWorkspaceMode("landing");
    setTitle("Workspace");
    $("#stage-title").textContent = "Your workspace";
    $("#file-kind").textContent = "Private by default · saved in this browser";
    $("#page-count").textContent = "No document open";
    $("#word-count").textContent = "Ready to write";
    $("#editor-card").classList.remove("pdf-preview");
    $("#editor-card").classList.add("landing");
    editor.hidden = false;
    editor.innerHTML = '<section class="landing-page"><span class="landing-kicker">ADIGUNFREEDOCEDITOR</span><h2>Your documents.<br>Your workspace.</h2><p>Create a document or open one of the file types supported in this first workspace.</p><div class="landing-actions"><button class="landing-primary" type="button" id="landing-create">Create blank document</button><button class="landing-secondary" type="button" id="landing-open">Open a file</button></div><div class="landing-details"><div><strong>Work stays here</strong><span>Editable document text is saved in this browser. No account or cloud sync is active.</span></div><div><strong>Supported in this build</strong><span>Import Word structure, edit TXT, Markdown and HTML, or view and download PDF</span></div></div></section>';
  }

  async function showDocumentList(view) {
    activePdfFile = undefined;
    $("#pdf-frame")?.remove();
    $("#editor-card").classList.remove("pdf-preview");
    $("#editor-card").classList.remove("landing");
    if (pdfUrl) { URL.revokeObjectURL(pdfUrl); pdfUrl = undefined; }
    setWorkspaceMode("list");
    editor.hidden = false;
    try {
      const allDocs = await getDocuments();
      const docs = allDocs.filter((doc) => Boolean(doc.deleted) === (view === "trash"));
      const heading = view === "documents" ? "My documents" : view === "trash" ? "Trash" : "Recent documents";
      setTitle(heading);
      $("#file-kind").textContent = `${docs.length} saved ${docs.length === 1 ? "document" : "documents"}`;
      const rows = view === "recent" ? docs.slice(0, 8) : docs;
      editor.innerHTML = rows.length ? rows.map((doc) => `<div class="recent-row"><button type="button" data-open-id="${doc.id}">${escapeHTML(doc.title)}</button><time>${new Date(doc.updatedAt).toLocaleDateString()}</time>${view === "trash" ? `<button type="button" data-restore-id="${doc.id}">Restore</button>` : `<button type="button" aria-label="Move ${escapeHTML(doc.title)} to Trash" data-trash-id="${doc.id}">Move to Trash</button>`}</div>`).join("") : `<div class="empty-state"><span class="empty-icon">${view === "trash" ? "⌫" : "▤"}</span><h2>${view === "trash" ? "Trash is empty" : "No saved documents yet"}</h2><p>${view === "trash" ? "Documents you move to Trash can be restored here." : "Create a document or open a text or PDF file. Your editable work is saved in this browser."}</p>${view !== "trash" ? '<button type="button" class="button button-outline" id="empty-create">Create a document</button>' : ""}</div>`;
      countWords();
    } catch { notify("Local document storage is not available in this browser."); }
  }

  function escapeHTML(text) {
    return text.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function inspectDocxArchive(buffer) {
    const bytes = new DataView(buffer);
    const minimum = Math.max(0, buffer.byteLength - 22 - 65535);
    let endOffset = -1;
    for (let offset = buffer.byteLength - 22; offset >= minimum; offset--) {
      if (bytes.getUint32(offset, true) === 0x06054b50) { endOffset = offset; break; }
    }
    if (endOffset < 0) throw new Error("The file is not a readable DOCX package.");
    const count = bytes.getUint16(endOffset + 10, true);
    const directorySize = bytes.getUint32(endOffset + 12, true);
    let cursor = bytes.getUint32(endOffset + 16, true);
    const directoryEnd = cursor + directorySize;
    if (count === 0 || count > 4096 || directoryEnd > endOffset || directoryEnd > buffer.byteLength) throw new Error("The Word package directory is invalid or too large.");
    const decoder = new TextDecoder();
    const names = new Set();
    let expandedBytes = 0;
    let hasDocument = false;
    for (let index = 0; index < count; index++) {
      if (cursor + 46 > directoryEnd || bytes.getUint32(cursor, true) !== 0x02014b50) throw new Error("The Word package directory is damaged.");
      const flags = bytes.getUint16(cursor + 8, true);
      const method = bytes.getUint16(cursor + 10, true);
      const compressed = bytes.getUint32(cursor + 20, true);
      const expanded = bytes.getUint32(cursor + 24, true);
      const nameLength = bytes.getUint16(cursor + 28, true);
      const extraLength = bytes.getUint16(cursor + 30, true);
      const commentLength = bytes.getUint16(cursor + 32, true);
      const next = cursor + 46 + nameLength + extraLength + commentLength;
      if (next > directoryEnd || (flags & 1) || (method !== 0 && method !== 8) || compressed === 0xffffffff || expanded === 0xffffffff) throw new Error("This Word package uses an unsupported or encrypted archive format.");
      const name = decoder.decode(new Uint8Array(buffer, cursor + 46, nameLength));
      if (names.has(name)) throw new Error("The Word package contains duplicate archive entries.");
      names.add(name);
      if (expanded > 50 * 1024 * 1024) throw new Error("A file inside this Word package exceeds the 50 MB import limit.");
      expandedBytes += expanded;
      if (expandedBytes > 100 * 1024 * 1024) throw new Error("The uncompressed Word package exceeds the 100 MB safety limit.");
      if (name === "word/document.xml") hasDocument = true;
      cursor = next;
    }
    if (cursor !== directoryEnd || !hasDocument || !names.has("[Content_Types].xml")) throw new Error("This file is missing required Word document parts.");
    if (expandedBytes > Math.max(32 * 1024 * 1024, buffer.byteLength * 150)) throw new Error("The Word package expands beyond the safe import ratio.");
  }

  function sanitizeDocxHtml(source) {
    const allowedTags = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "u", "s", "del", "ul", "ol", "li", "a", "br", "hr", "blockquote", "pre", "code", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "img"]);
    const parsed = new DOMParser().parseFromString(`<main>${source}</main>`, "text/html");
    const root = parsed.querySelector("main");
    let removed = 0;

    function copy(node) {
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue);
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const tag = node.tagName.toLowerCase();
      if (tag === "img") {
        const src = node.getAttribute("src") || "";
        if (!/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/]+={0,2}$/i.test(src) || src.length > 11 * 1024 * 1024) { removed++; return null; }
        const image = document.createElement("img");
        image.src = src;
        image.alt = (node.getAttribute("alt") || "").slice(0, 300);
        for (const dimension of ["width", "height"]) {
          const value = Number(node.getAttribute(dimension));
          if (Number.isInteger(value) && value > 0 && value <= 4096) image.setAttribute(dimension, String(value));
        }
        return image;
      }
      if (!allowedTags.has(tag)) { removed++; const fragment = document.createDocumentFragment(); for (const child of [...node.childNodes]) { const safeChild = copy(child); if (safeChild) fragment.append(safeChild); } return fragment; }
      const element = document.createElement(tag);
      if (tag === "a") {
        const href = node.getAttribute("href") || "";
        try { const url = new URL(href, location.href); if (["http:", "https:", "mailto:"].includes(url.protocol)) element.setAttribute("href", url.href); else removed++; } catch { removed++; }
      }
      if (["th", "td"].includes(tag)) {
        for (const dimension of ["colspan", "rowspan"]) { const value = Number(node.getAttribute(dimension)); if (Number.isInteger(value) && value > 0 && value <= 50) element.setAttribute(dimension, String(value)); }
      }
      if (tag === "ol") { const start = Number(node.getAttribute("start")); if (Number.isInteger(start) && start >= 1 && start <= 100000) element.setAttribute("start", String(start)); }
      for (const child of [...node.childNodes]) { const safeChild = copy(child); if (safeChild) element.append(safeChild); }
      return element;
    }

    const safeRoot = document.createElement("div");
    for (const child of [...root.childNodes]) { const safeChild = copy(child); if (safeChild) safeRoot.append(safeChild); }
    return { html: safeRoot.innerHTML, removed };
  }

  function openSaved(id) {
    activePdfFile = undefined;
    $("#pdf-frame")?.remove();
    $("#editor-card").classList.remove("pdf-preview");
    if (pdfUrl) { URL.revokeObjectURL(pdfUrl); pdfUrl = undefined; }
    database.transaction("documents", "readonly").objectStore("documents").get(id).onsuccess = (event) => {
      const doc = event.target.result;
      if (!doc) return;
      activeId = doc.id;
      setTitle(doc.title);
      setWorkspaceMode("document");
      $("#editor-card").classList.remove("landing");
      $("#file-kind").textContent = "Saved on this device";
      editor.innerHTML = doc.content;
      editor.hidden = false;
      countWords();
      notify("Document opened.");
    };
  }

  async function importFile(file) {
    if (!file) return;
    const extension = file.name.split(".").pop().toLowerCase();
    if (!(["txt", "md", "html", "htm", "pdf", "docx"].includes(extension))) {
      notify("Supported files: Word DOCX, TXT, Markdown, HTML, and PDF.");
      return;
    }
    if (extension === "docx") {
      try {
        if (file.size > 20 * 1024 * 1024) throw new Error("Word documents must be 20 MB or smaller.");
        if (!window.mammoth?.convertToHtml) throw new Error("The local Word import module did not load. Reload the page and try again.");
        const arrayBuffer = await file.arrayBuffer();
        inspectDocxArchive(arrayBuffer);
        const converted = await window.mammoth.convertToHtml({ arrayBuffer });
        const sanitized = sanitizeDocxHtml(converted.value);
        if (sanitized.html.length > 12 * 1024 * 1024) throw new Error("The editable document exceeds the 12 MB safety limit.");
        if (pdfUrl) { URL.revokeObjectURL(pdfUrl); pdfUrl = undefined; }
        $("#pdf-frame")?.remove();
        activePdfFile = undefined;
        activeId = crypto.randomUUID();
        setTitle(file.name.replace(/\.docx$/i, "") || file.name);
        $("#file-kind").textContent = "DOCX imported · editable structure";
        $("#editor-card").classList.remove("pdf-preview", "landing");
        editor.hidden = false;
        setWorkspaceMode("document");
        $("#export-html").lastElementChild.textContent = "Export HTML";
        editor.innerHTML = sanitized.html || "<p><br></p>";
        countWords();
        saveDocument();
        const warningCount = converted.messages.filter((message) => message.type === "warning").length;
        const notes = [];
        if (warningCount) notes.push(`${warningCount} Word compatibility warning${warningCount === 1 ? "" : "s"}`);
        if (sanitized.removed) notes.push(`${sanitized.removed} unsupported or unsafe item${sanitized.removed === 1 ? "" : "s"} omitted`);
        notify(notes.length ? `DOCX imported. ${notes.join("; ")}. Layout and advanced formatting may differ.` : "DOCX imported as editable structure. Word page layout and advanced formatting may differ.");
      } catch (error) { notify(`Could not import this Word document: ${error.message}`); }
      return;
    }
    if (pdfUrl) { URL.revokeObjectURL(pdfUrl); pdfUrl = undefined; }
    $("#pdf-frame")?.remove();
    activePdfFile = undefined;
    activeId = crypto.randomUUID();
    setTitle(file.name.replace(/\.[^.]+$/, "") || file.name);
    $("#file-kind").textContent = extension === "pdf" ? "PDF preview · original file" : `${extension.toUpperCase()} imported as editable text`;
    $("#editor-card").classList.remove("pdf-preview");
    $("#editor-card").classList.remove("landing");
    editor.hidden = false;
    if (extension === "pdf" || file.type === "application/pdf") {
      setWorkspaceMode("pdf");
      activePdfFile = file;
      pdfUrl = URL.createObjectURL(file);
      editor.hidden = true;
      $("#editor-card").classList.add("pdf-preview");
      const oldFrame = $("#pdf-frame");
      if (oldFrame) oldFrame.remove();
      const frame = document.createElement("iframe");
      frame.id = "pdf-frame";
      frame.title = `PDF preview: ${file.name}`;
      frame.src = `${pdfUrl}#toolbar=1&navpanes=0`;
      $("#editor-card").insertBefore(frame, $(".page-footer"));
      $("#word-count").textContent = "PDF preview";
      $("#page-count").textContent = "Original PDF";
      $("#insight-words").textContent = "—";
      $("#insight-characters").textContent = "—";
      $("#insight-reading").textContent = "—";
      $("#export-html").lastElementChild.textContent = "Download PDF";
      $(".ribbon-tabs").hidden = true;
      ribbon.hidden = true;
      notify("PDF opened in your browser's viewer.");
      return;
    }
    setWorkspaceMode("document");
    $("#export-html").lastElementChild.textContent = "Export HTML";
    const text = await file.text();
    const plain = extension === "html" || extension === "htm" ? new DOMParser().parseFromString(text, "text/html").body.innerText : text;
    editor.innerHTML = plain.split(/\r?\n/).map((line) => `<p>${escapeHTML(line) || "<br>"}</p>`).join("") || "<p><br></p>";
    countWords();
    saveDocument();
    notify("File opened. Imported text is saved in this browser.");
  }

  function setZoom(next) {
    zoom = Math.max(70, Math.min(150, next));
    editor.style.zoom = `${zoom}%`;
    $("#zoom-value").textContent = `${zoom}%`;
  }

  function renderRibbon() {
    ribbon.replaceChildren();
    for (const group of toolsets[activeTab]) {
      const section = document.createElement("div");
      section.className = "tool-group";
      for (const tool of group) {
        let control;
        if (tool.select) {
          control = document.createElement("select");
          control.className = "tool-select";
          control.setAttribute("aria-label", tool.label);
          for (const [value, label] of tool.options) {
            const option = document.createElement("option"); option.value = value; option.textContent = label; control.append(option);
          }
          control.addEventListener("change", () => {
            if (tool.select === "block") runCommand("formatBlock", `<${control.value}>`);
            if (tool.select === "size") runCommand("fontSize", control.value);
            if (tool.select === "paper") setPaper(control.value);
          });
        } else {
          control = document.createElement("button");
          control.type = "button"; control.className = "tool-button"; control.textContent = tool.icon; control.title = tool.label; control.setAttribute("aria-label", tool.label);
          if (tool.pressed) control.setAttribute("aria-pressed", "false");
          control.addEventListener("click", () => runTool(tool.action, control));
        }
        section.append(control);
      }
      ribbon.append(section);
    }
  }

  function runCommand(command, value) {
    editor.focus();
    document.execCommand(command, false, value || null);
    countWords(); saveDocument();
  }

  function runTool(action, button) {
    switch (action) {
      case "undo": case "redo": case "bold": case "italic": case "underline": case "insertUnorderedList": case "insertOrderedList": case "justifyLeft": case "justifyCenter": case "justifyRight": case "unlink":
        runCommand(action); break;
      case "link": {
        const url = window.prompt("Enter a link URL (https://…)");
        if (url && /^https?:\/\//i.test(url)) runCommand("createLink", url);
        else if (url) notify("Use a full https:// or http:// link.");
        break;
      }
      case "date": runCommand("insertText", new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date())); break;
      case "divider": runCommand("insertHTML", "<hr><p><br></p>"); break;
      case "orientation": pageOrientation = pageOrientation === "portrait" ? "landscape" : "portrait"; $("#editor-card").classList.toggle("landscape", pageOrientation === "landscape"); button.textContent = pageOrientation === "portrait" ? "▯ Portrait" : "▭ Landscape"; break;
      case "spellcheck": editor.spellcheck = !editor.spellcheck; button.setAttribute("aria-pressed", String(editor.spellcheck)); notify(`Browser spellcheck ${editor.spellcheck ? "on" : "off"}.`); break;
      case "wordcount": notify($("#word-count").textContent); break;
      case "zoom-out": setZoom(zoom - 10); break;
      case "zoom-in": setZoom(zoom + 10); break;
      case "zoom-reset": setZoom(100); break;
      case "find": { const query = window.prompt("Find in this document"); if (query) window.find(query, false, false, true); break; }
      case "assistant": toggleAssistant(); break;
    }
  }

  function setPaper(size) {
    $("#editor-card").classList.toggle("paper-letter", size === "letter");
  }

  function wordXmlText(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
  }

  function makeWordPackage() {
    const relationships = [];
    const hyperlinkIds = new Map();
    const unsupported = new Set();
    let nextRelationship = 3;

    function serializeInline(node, marks = {}) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue.replace(/\s+/g, " ");
        if (!text) return "";
        const preserve = /^\s|\s$/.test(node.nodeValue) ? ' xml:space="preserve"' : "";
        const properties = [marks.bold && "<w:b/>", marks.italic && "<w:i/>", marks.underline && '<w:u w:val="single"/>', marks.strike && "<w:strike/>"].filter(Boolean).join("");
        return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}<w:t${preserve}>${wordXmlText(text)}</w:t></w:r>`;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const tag = node.tagName.toLowerCase();
      if (tag === "br") return "<w:r><w:br/></w:r>";
      if (tag === "img") { unsupported.add("images"); return ""; }
      if (["script", "style", "button"].includes(tag)) return "";
      const next = { ...marks };
      if (["b", "strong"].includes(tag)) next.bold = true;
      if (["i", "em"].includes(tag)) next.italic = true;
      if (tag === "u") next.underline = true;
      if (["s", "strike", "del"].includes(tag)) next.strike = true;
      const children = [...node.childNodes].map((child) => serializeInline(child, next)).join("");
      if (tag === "a") {
        const href = node.getAttribute("href") || "";
        if (!/^https?:\/\//i.test(href)) { unsupported.add("non-web links"); return children; }
        if (!hyperlinkIds.has(href)) {
          const id = `rId${nextRelationship++}`;
          hyperlinkIds.set(href, id);
          relationships.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${wordXmlText(href)}" TargetMode="External"/>`);
        }
        return `<w:hyperlink r:id="${hyperlinkIds.get(href)}">${children}</w:hyperlink>`;
      }
      if (["mark", "sub", "sup"].includes(tag)) unsupported.add(tag);
      return children;
    }

    const body = [];
    function addParagraph(element, listKind = "", listLevel = 0) {
      const tag = element.tagName.toLowerCase();
      const paragraphProperties = [];
      if (["h1", "h2", "h3"].includes(tag)) paragraphProperties.push(`<w:pStyle w:val="Heading${tag.slice(1)}"/>`);
      const align = ["left", "center", "right", "justify"].includes(element.style.textAlign) ? element.style.textAlign : "";
      if (align) paragraphProperties.push(`<w:jc w:val="${align}"/>`);
      if (listKind) paragraphProperties.push(`<w:numPr><w:ilvl w:val="${Math.min(listLevel, 8)}"/><w:numId w:val="${listKind === "ol" ? 2 : 1}"/></w:numPr>`);
      const runs = [...element.childNodes].map((node) => serializeInline(node)).join("") || "<w:r><w:t></w:t></w:r>";
      body.push(`<w:p>${paragraphProperties.length ? `<w:pPr>${paragraphProperties.join("")}</w:pPr>` : ""}${runs}</w:p>`);
    }

    function walkBlocks(node, listKind = "", listLevel = 0) {
      for (const child of [...node.children]) {
        const tag = child.tagName.toLowerCase();
        if (tag === "ul" || tag === "ol") { walkBlocks(child, tag, listLevel); continue; }
        if (tag === "li") {
          const inlineChildren = [...child.children].filter((item) => ["ul", "ol"].includes(item.tagName.toLowerCase()));
          if (listLevel > 0 || inlineChildren.length) unsupported.add("nested list hierarchy");
          const copy = child.cloneNode(true);
          for (const nested of [...copy.children]) if (["ul", "ol"].includes(nested.tagName.toLowerCase())) nested.remove();
          addParagraph(copy, listKind || "ul", 0);
          for (const nested of inlineChildren) walkBlocks(nested, nested.tagName.toLowerCase(), listLevel + 1);
          continue;
        }
        if (["p", "h1", "h2", "h3", "blockquote", "pre"].includes(tag)) {
          if (tag === "blockquote" || tag === "pre") unsupported.add(tag === "pre" ? "code blocks" : "block quotes");
          addParagraph(child, listKind, listLevel);
          continue;
        }
        if (tag === "table") {
          unsupported.add("tables");
          for (const row of child.querySelectorAll("tr")) addParagraph(row, "", 0);
          continue;
        }
        if (tag === "hr") { body.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="808080"/></w:pBdr></w:pPr><w:r><w:t></w:t></w:r></w:p>'); continue; }
        if (child.children.length) walkBlocks(child, listKind, listLevel);
        else if (child.textContent.trim()) addParagraph(child, listKind, listLevel);
      }
    }
    walkBlocks(editor);
    if (!body.length) body.push("<w:p><w:r><w:t></w:t></w:r></w:p>");

    const isLetter = $("#editor-card").classList.contains("paper-letter");
    const landscape = $("#editor-card").classList.contains("landscape");
    let width = isLetter ? 12240 : 11906;
    let height = isLetter ? 15840 : 16838;
    if (landscape) [width, height] = [height, width];
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="${width}" w:h="${height}"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style></w:styles>';
    const numberingXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="multilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="multilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>';
    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
    const rootRelationships = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
    const documentRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${relationships.join("")}</Relationships>`;
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const coreProperties = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${wordXmlText(title())}</dc:title><dc:creator>adigunFreeDocEditor</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
    const appProperties = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>adigunFreeDocEditor</Application></Properties>';
    return { files: { "[Content_Types].xml": contentTypes, "_rels/.rels": rootRelationships, "word/document.xml": documentXml, "word/styles.xml": stylesXml, "word/numbering.xml": numberingXml, "word/_rels/document.xml.rels": documentRelationships, "docProps/core.xml": coreProperties, "docProps/app.xml": appProperties }, unsupported: [...unsupported] };
  }

  function makeStoredZip(files) {
    const encoder = new TextEncoder();
    const crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
    const crc32 = (data) => { let crc = 0xffffffff; for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; };
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const [name, value] of Object.entries(files)) {
      const filename = encoder.encode(name); const data = encoder.encode(value); const crc = crc32(data);
      const local = new Uint8Array(30 + filename.length); const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0, true); lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true); lv.setUint16(12, 33, true); lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, filename.length, true); lv.setUint16(28, 0, true); local.set(filename, 30);
      chunks.push(local, data);
      const entry = new Uint8Array(46 + filename.length); const ev = new DataView(entry.buffer);
      ev.setUint32(0, 0x02014b50, true); ev.setUint16(4, 20, true); ev.setUint16(6, 20, true); ev.setUint16(8, 0, true); ev.setUint16(10, 0, true); ev.setUint16(12, 0, true); ev.setUint16(14, 33, true); ev.setUint32(16, crc, true); ev.setUint32(20, data.length, true); ev.setUint32(24, data.length, true); ev.setUint16(28, filename.length, true); ev.setUint16(30, 0, true); ev.setUint16(32, 0, true); ev.setUint16(34, 0, true); ev.setUint16(36, 0, true); ev.setUint32(38, 0, true); ev.setUint32(42, offset, true); entry.set(filename, 46); central.push(entry);
      offset += local.length + data.length;
    }
    const centralSize = central.reduce((sum, entry) => sum + entry.length, 0);
    const end = new Uint8Array(22); const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true); ev.setUint16(8, central.length, true); ev.setUint16(10, central.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true); ev.setUint16(20, 0, true);
    return new Blob([...chunks, ...central, end], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }

  function exportDocx() {
    if (activePdfFile) { notify("Open an editable document before exporting a Word file."); return; }
    const wordPackage = makeWordPackage();
    if (wordPackage.unsupported.length && !window.confirm(`This export cannot preserve: ${wordPackage.unsupported.join(", ")}. It will create a reduced Word copy and leave the browser-saved document unchanged. Continue?`)) return;
    download(makeStoredZip(wordPackage.files), `${safeFilename(title())}.docx`);
    notify(wordPackage.unsupported.length ? `Word file saved. Check unsupported content: ${wordPackage.unsupported.join(", ")}.` : "Word document downloaded. Basic formatting and page setup were preserved.");
  }

  function exportHTML() {
    if (activePdfFile) { download(activePdfFile, activePdfFile.name); return; }
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHTML(title())}</title></head><body>${editor.innerHTML}</body></html>`;
    download(new Blob([html], { type: "text/html;charset=utf-8" }), `${safeFilename(title())}.html`);
    notify("HTML document exported.");
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function safeFilename(name) { return name.replace(/[\\/:*?"<>|]/g, "-").slice(0, 90) || "document"; }

  function toggleAssistant(open = assistant.classList.contains("hidden")) {
    assistant.classList.toggle("hidden", !open);
    $("#assistant-launcher").classList.toggle("visible", !open);
    assistant.setAttribute("aria-hidden", String(!open));
  }

  function buildOverview() {
    const text = editor.innerText.trim();
    const result = $("#overview-result");
    if (!text || activePdfFile) { result.hidden = true; notify("Open an editable document with text to build an overview."); return; }
    const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [];
    if (sentences.length <= 3) {
      result.innerHTML = `<h3>Quick overview · source sentences</h3>${sentences.map((s) => `<p>${escapeHTML(s)}</p>`).join("")}`;
    } else {
      const stopWords = new Set("a an and are as at be been but by for from had has have he her his i in is it its of on or our she that the their them there they this to was we were will with you your".split(" "));
      const frequency = new Map();
      for (const word of text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []) if (!stopWords.has(word)) frequency.set(word, (frequency.get(word) || 0) + 1);
      const ranked = sentences.map((sentence, index) => {
        const terms = sentence.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
        const score = terms.reduce((sum, word) => sum + (stopWords.has(word) ? 0 : frequency.get(word) || 0), 0) / Math.max(terms.length, 1);
        return { sentence, index, score };
      }).sort((a, b) => b.score - a.score).slice(0, Math.min(3, Math.ceil(sentences.length / 4))).sort((a, b) => a.index - b.index);
      result.innerHTML = `<h3>Quick overview · source sentences</h3>${ranked.map(({ sentence }) => `<p>${escapeHTML(sentence)}</p>`).join("")}`;
    }
    result.hidden = false;
  }

  function markDeleted(id, deleted) {
    const tx = database.transaction("documents", "readwrite");
    const store = tx.objectStore("documents");
    const request = store.get(id);
    request.onsuccess = () => { const doc = request.result; if (doc) store.put({ ...doc, deleted, updatedAt: Date.now() }); };
    tx.oncomplete = () => { notify(deleted ? "Document moved to Trash." : "Document restored."); showDocumentList(document.querySelector(".nav-item.active")?.dataset.view || "recent"); };
  }

  function setupAssistantDrag() {
    const handle = $("#adigun-drag-handle");
    let start;
    handle.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      start = { x: event.clientX, y: event.clientY, left: assistant.offsetLeft, top: assistant.offsetTop };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", (event) => {
      if (!start) return;
      const left = Math.max(8, Math.min(window.innerWidth - assistant.offsetWidth - 8, start.left + event.clientX - start.x));
      const top = Math.max(8, Math.min(window.innerHeight - 55, start.top + event.clientY - start.y));
      assistant.style.left = `${left}px`; assistant.style.top = `${top}px`; assistant.style.right = "auto";
    });
    const finish = () => { if (start) localStorage.setItem("adigun-assistant-position", JSON.stringify({ left: assistant.style.left, top: assistant.style.top })); start = undefined; };
    handle.addEventListener("pointerup", finish); handle.addEventListener("pointercancel", finish);
    try { const pos = JSON.parse(localStorage.getItem("adigun-assistant-position")); if (pos?.left && pos?.top) Object.assign(assistant.style, pos, { right: "auto" }); } catch { /* Ignore invalid optional position data. */ }
  }

  $("#new-document").addEventListener("click", () => { setMobileMenu(false); createDocument(); });
  $("#open-document").addEventListener("click", () => { setMobileMenu(false); filePicker.click(); });
  $("#mobile-menu").addEventListener("click", () => setMobileMenu(!$("#workspace-nav").classList.contains("mobile-open")));
  filePicker.addEventListener("change", () => { importFile(filePicker.files[0]); filePicker.value = ""; });
  titleInput.addEventListener("input", () => { $("#stage-title").textContent = title(); saveDocument(); });
  editor.addEventListener("input", () => { countWords(); saveDocument(); });
  $("#export-html").addEventListener("click", exportHTML);
  $("#export-docx").addEventListener("click", exportDocx);
  $("#undo").addEventListener("click", () => runCommand("undo"));
  $("#redo").addEventListener("click", () => runCommand("redo"));
  $("#zoom-out").addEventListener("click", () => setZoom(zoom - 10));
  $("#zoom-in").addEventListener("click", () => setZoom(zoom + 10));
  $("#assist-button").addEventListener("click", () => toggleAssistant(true));
  $("#assistant-launcher").addEventListener("click", () => toggleAssistant(true));
  $("#close-adigun").addEventListener("click", () => toggleAssistant(false));
  $("#minimize-adigun").addEventListener("click", () => { assistant.classList.toggle("minimized"); $("#minimize-adigun").setAttribute("aria-label", assistant.classList.contains("minimized") ? "Restore Adigun" : "Minimize Adigun"); });
  $(".ribbon-tabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-tab]"); if (!tab) return;
    activeTab = tab.dataset.tab;
    document.querySelectorAll(".ribbon-tab").forEach((item) => item.classList.toggle("selected", item === tab));
    renderRibbon();
  });
  $(".sidebar").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]"); if (!button) return;
    setMobileMenu(false);
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item === button));
    if (button.dataset.view === "settings") { $("#autosave-toggle").checked = autosave; $("#settings-dialog").showModal(); }
    else showDocumentList(button.dataset.view);
  });
  editor.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-open-id]"); if (openButton) openSaved(openButton.dataset.openId);
    if (event.target.closest("#empty-create")) createDocument();
    if (event.target.closest("#landing-create")) createDocument();
    if (event.target.closest("#landing-open")) filePicker.click();
    const trashButton = event.target.closest("[data-trash-id]"); if (trashButton) markDeleted(trashButton.dataset.trashId, true);
    const restoreButton = event.target.closest("[data-restore-id]"); if (restoreButton) markDeleted(restoreButton.dataset.restoreId, false);
  });
  $("#build-overview").addEventListener("click", buildOverview);
  $("#autosave-toggle").addEventListener("change", (event) => { autosave = event.target.checked; localStorage.setItem("adigun-autosave", String(autosave)); if (autosave) saveDocument(); else setSaveStatus("Autosave off"); });
  document.addEventListener("keydown", (event) => {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "s") { event.preventDefault(); saveDocument(true); notify("Saved in this browser."); }
  });
  for (const type of ["dragenter", "dragover"]) $("#document-stage").addEventListener(type, (event) => { event.preventDefault(); $("#editor-card").classList.add("drop-active"); });
  for (const type of ["dragleave", "drop"]) $("#document-stage").addEventListener(type, (event) => { event.preventDefault(); $("#editor-card").classList.remove("drop-active"); if (type === "drop") importFile(event.dataTransfer.files[0]); });

  renderRibbon(); setupAssistantDrag(); countWords();
  if (window.matchMedia("(max-width: 700px)").matches) toggleAssistant(false);
  openDatabase().then(async () => { setSaveStatus("Saved"); if ((await getDocuments()).length) await showDocumentList("recent"); else showLanding(); }).catch(() => { setSaveStatus("Local save unavailable"); notify("Local saving is unavailable in this browser."); showLanding(); });
})();
