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
    editor.innerHTML = '<section class="landing-page"><span class="landing-kicker">ADIGUNFREEDOCEDITOR</span><h2>Your documents.<br>Your workspace.</h2><p>Create a document or open one of the file types supported in this first workspace.</p><div class="landing-actions"><button class="landing-primary" type="button" id="landing-create">Create blank document</button><button class="landing-secondary" type="button" id="landing-open">Open a file</button></div><div class="landing-details"><div><strong>Work stays here</strong><span>Editable document text is saved in this browser. No account or cloud sync is active.</span></div><div><strong>Supported in this build</strong><span>Edit TXT, Markdown and HTML · view and download PDF</span></div></div></section>';
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
    if (!(["txt", "md", "html", "htm", "pdf"].includes(extension))) {
      notify("This build opens PDFs for viewing and edits TXT, Markdown or HTML files.");
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
