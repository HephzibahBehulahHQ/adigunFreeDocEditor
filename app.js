(() => {
  const $ = (selector) => document.querySelector(selector);
  const editor = $("#document");
  const titleInput = $("#document-title");
  const saveState = $("#save-state");
  const toast = $("#toast");
  const ribbon = $("#ribbon-tools");
  const assistant = $("#adigun-window");
  const filePicker = $("#file-picker");
  const conversionFilePicker = $("#conversion-file-picker");
  const acceptedFileTypes = filePicker.accept;
  const imagePicker = $("#image-picker");
  const documentModel = window.AdigunDocumentModel;
  const DB_NAME = "adigunFreeDocEditor";
  let database;
  let activeId = crypto.randomUUID();
  let activeTab = "home";
  let saveTimer;
  let editorPaginationTimer;
  let toastTimer;
  let zoom = 100;
  let pdfUrl;
  let activePdfFile;
  let pageOrientation = "portrait";
  let paperSize = "a4";
  let pageCanvasDimensions = "";
  let pageMargins = "normal";
  let pageNumbersEnabled = false;
  let pageHeaderText = "";
  let pageFooterText = "";
  let conversionSourceFile;
  let conversionOutputBlob;
  let conversionOutputName = "";
  let tableInsertionRange;
  let imageInsertionRange;
  let reviewComments = [];
  let trackChangesEnabled = false;
  let reviewFilter = "all";
  let reviewSearch = "";
  let pendingReviewAnchor;
  let reviewHighlightTimer;
  let findMatches = [];
  let findMatchTotal = 0;
  let currentFindIndex = -1;
  let replacingAllMatches = false;
  let paragraphRulerBlocks = [];
  let paragraphRulerRange = null;
  const FIND_MATCH_LIMIT = 5000;
  let autosave = localStorage.getItem("adigun-autosave") !== "false";
  let theme = localStorage.getItem("adigun-theme") === "dark" ? "dark" : "light";
  const defaultPageLayout = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem("adigun-page-defaults") || "{}");
      return {
        paper: saved.paper === "letter" ? "letter" : "a4",
        orientation: saved.orientation === "landscape" ? "landscape" : "portrait",
        margins: ["narrow", "wide"].includes(saved.margins) ? saved.margins : "normal",
      };
    } catch {
      return { paper: "a4", orientation: "portrait", margins: "normal" };
    }
  })();
  document.documentElement.dataset.theme = theme;

  const supportedFontFamilies = ["Arial", "Calibri", "Cambria", "Courier New", "Georgia", "Tahoma", "Times New Roman", "Verdana"];

  function supportedFontFamily(value) {
    const name = String(value || "").split(",")[0].trim().replace(/^["\']|["\']$/g, "");
    return supportedFontFamilies.find((family) => family.toLowerCase() === name.toLowerCase()) || "";
  }

  const textColorOptions = [["#000000", "Black"], ["#404040", "Dark gray"], ["#C00000", "Red"], ["#ED7D31", "Orange"], ["#FFC000", "Gold"], ["#548235", "Green"], ["#4472C4", "Blue"], ["#7030A0", "Purple"], ["#00B0F0", "Cyan"], ["#FFFFFF", "White"]];
  const highlightColorOptions = [["#FFFF00", "Yellow"], ["#00FF00", "Bright green"], ["#00FFFF", "Cyan"], ["#FF00FF", "Magenta"], ["#0000FF", "Blue"], ["#FF0000", "Red"], ["#000080", "Dark blue"], ["#008080", "Dark cyan"], ["#008000", "Dark green"], ["#800080", "Dark magenta"], ["#800000", "Dark red"], ["#808000", "Dark yellow"], ["#808080", "Dark gray"], ["#C0C0C0", "Light gray"], ["#000000", "Black"], ["#FFFFFF", "White"]];
  const supportedColors = new Set([...textColorOptions, ...highlightColorOptions].map(([color]) => color));

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

  const toolsets = {
    home: [
      [{ label: "Undo", action: "undo", icon: "↶" }, { label: "Redo", action: "redo", icon: "↷" }],
      [{ label: "Font family", select: "font", options: [["", "Font"], ...supportedFontFamilies.map((family) => [family, family])] }, { label: "Text style", select: "block", options: [["p", "Normal"], ["h1", "Title"], ["h2", "Heading 1"], ["h3", "Heading 2"]] }, { label: "Font size", select: "size", options: [["3", "11"], ["4", "14"], ["5", "18"], ["6", "24"]] }],
      [{ label: "Text color", select: "text-color", options: [["", "Text color"], ...textColorOptions] }, { label: "Highlight color", select: "highlight-color", options: [["", "Highlight"], ...highlightColorOptions] }],
      [{ label: "Line spacing", select: "line-spacing", options: [["", "Default"], ["1", "Single"], ["1.15", "1.15"], ["1.5", "1.5"], ["2", "Double"]] }, { label: "Paragraph spacing after", select: "paragraph-spacing", options: [["", "Default"], ["0", "None"], ["6", "Compact"], ["12", "Relaxed"]] }],
      [{ label: "Bold", action: "bold", icon: "B", pressed: true }, { label: "Italic", action: "italic", icon: "I", pressed: true }, { label: "Underline", action: "underline", icon: "U", pressed: true }, { label: "Strikethrough", action: "strikeThrough", icon: "S̶ Strike", pressed: true }, { label: "Clear character formatting", action: "removeFormat", icon: "T× Clear" }],
      [{ label: "Bulleted list", action: "insertUnorderedList", icon: "• List", pressed: true }, { label: "Numbered list", action: "insertOrderedList", icon: "1. List", pressed: true }],
      [{ label: "Decrease indent", action: "outdent", icon: "⇤ Outdent" }, { label: "Increase indent", action: "indent", icon: "⇥ Indent" }],
      [{ label: "Align left", action: "justifyLeft", icon: "☰", pressed: true }, { label: "Center", action: "justifyCenter", icon: "≡", pressed: true }, { label: "Align right", action: "justifyRight", icon: "☷", pressed: true }, { label: "Justify", action: "justifyFull", icon: "▤", pressed: true }],
    ],
    insert: [
      [{ label: "Add link", action: "link", icon: "↗ Link" }, { label: "Remove link", action: "unlink", icon: "↗̸" }],
      [{ label: "Insert today's date", action: "date", icon: "▦ Date" }, { label: "Insert divider", action: "divider", icon: "― Divider" }, { label: "Insert page break", action: "page-break", icon: "↧ Page break" }, { label: "Insert table (first row is a header)", action: "table", icon: "▦ Table" }, { label: "Insert image from this device", action: "image", icon: "▧ Image" }],
      [{ label: "Insert row above", action: "table-row-above", icon: "▤ Row ↑" }, { label: "Insert row below", action: "table-row-below", icon: "▤ Row ↓" }, { label: "Insert column left", action: "table-column-left", icon: "▥ Col ←" }, { label: "Insert column right", action: "table-column-right", icon: "▥ Col →" }, { label: "Delete row", action: "table-row-delete", icon: "⌫ Row" }, { label: "Delete column", action: "table-column-delete", icon: "⌫ Col" }, { label: "Delete table", action: "table-delete", icon: "⌫ Table" }, { label: "Merge adjacent cells", action: "table-merge", icon: "▦ Merge" }, { label: "Merge cells vertically", action: "table-merge-vertical", icon: "▤ Merge ↓" }, { label: "Split merged cell", action: "table-split", icon: "▦ Split" }],
    ],
    layout: [
      [{ label: "Page size", select: "paper", options: [["a4", "A4"], ["letter", "US Letter"]] }, { label: "Margins", select: "margins", options: [["normal", "Normal"], ["narrow", "Narrow"], ["wide", "Wide"]] }, { label: "Orientation", action: "orientation", icon: "▯ Portrait" }, { label: "Header & footer", action: "page-header-footer", icon: "↕ Header / footer" }, { label: "Page numbers", action: "page-numbers", icon: "＃ Pages" }],
    ],
    review: [
      [{ label: "Track changes", action: "track-changes", icon: "▤ Track changes" }, { label: "Add comment", action: "add-comment", icon: "▧ Comment" }, { label: "Review comments", action: "show-comments", icon: "☷ Comments" }],
      [{ label: "Spellcheck", action: "spellcheck", icon: "✓ Spellcheck", pressed: true }, { label: "Word count", action: "wordcount", icon: "# Word count" }],
    ],
    view: [
      [{ label: "Zoom out", action: "zoom-out", icon: "−" }, { label: "Zoom in", action: "zoom-in", icon: "+" }, { label: "Fit to width", action: "zoom-fit", icon: "↔ Fit width" }, { label: "Reset zoom", action: "zoom-reset", icon: "100%" }],
      [{ label: "Find and replace", action: "find", icon: "⌕ Find & replace" }, { label: "Toggle Adigun", action: "assistant", icon: "✧ Adigun" }],
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

  function setTheme(value) {
    theme = value === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("adigun-theme", theme);
    const themeColor = $("meta[name=theme-color]");
    if (themeColor) themeColor.content = theme === "dark" ? "#0e1623" : "#0b1220";
  }

  setTheme(theme);

  function title() {
    return titleInput.value.trim() || "Untitled document";
  }

  function countWords() {
    const isEditableDocument = editor.contentEditable === "true";
    const plainText = isEditableDocument ? editor.innerText.trim() : "";
    applyPaperCanvasMinimumHeight();
    scheduleEditorPagination();
    const words = plainText.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu) || [];
    $("#word-count").textContent = `${words.length} ${words.length === 1 ? "word" : "words"}`;
    const pageCount = Math.max(1, editor.querySelectorAll(".document-sheet").length);
    $("#page-count").textContent = `${pageCount} ${pageCount === 1 ? "page" : "pages"}`;
    $("#insight-words").textContent = isEditableDocument ? words.length.toLocaleString() : "—";
    $("#insight-characters").textContent = isEditableDocument ? plainText.length.toLocaleString() : "—";
    $("#insight-reading").textContent = isEditableDocument ? (words.length < 180 ? "<1 min" : `${Math.ceil(words.length / 180)} min`) : "—";
 
    renderOutline();
  }

  function renderOutline() {
    const panel = $("#document-outline");
    const list = $("#outline-list");
    if (!panel || !list || !panel.classList.contains("visible")) return;
    const headings = [...editor.querySelectorAll("h1, h2, h3")];
    const query = $("#outline-search").value.trim().toLocaleLowerCase();
    const visibleHeadings = headings.map((heading, index) => ({ heading, index })).filter(({ heading }) => (heading.innerText.trim() || "Untitled heading").toLocaleLowerCase().includes(query));
    $("#outline-count").textContent = `${headings.length} ${headings.length === 1 ? "heading" : "headings"}`;
    list.replaceChildren();
    for (const { heading, index } of visibleHeadings) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "outline-item outline-" + heading.tagName.toLowerCase();
      button.dataset.outlineIndex = String(index);
      button.textContent = heading.innerText.trim() || "Untitled heading";
      list.append(button);
    }
    const empty = $("#outline-empty");
    empty.hidden = visibleHeadings.length > 0;
    empty.textContent = headings.length && query ? "No headings match this filter." : "Add a heading from the Home ribbon to build an outline.";
  }

  function renderPageNavigation() {
    const list = $("#break-navigation-list");
    if (!list) return;
    const sheets = [...editor.querySelectorAll(".document-sheet")];
    $("#break-navigation-count").textContent = `${sheets.length} ${sheets.length === 1 ? "page" : "pages"}`;
    list.replaceChildren();
    sheets.forEach((sheet, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "break-navigation-item page-thumbnail-item";
      button.dataset.pageIndex = String(index);
      button.setAttribute("aria-label", `Go to page ${index + 1}`);

      const preview = document.createElement("span");
      preview.className = "page-thumbnail-preview";
      preview.setAttribute("aria-hidden", "true");
      const replica = sheet.cloneNode(true);
      replica.classList.add("document-page", "page-thumbnail-sheet");
      replica.removeAttribute("data-editor-page");
      replica.removeAttribute("role");
      replica.removeAttribute("aria-label");
      replica.setAttribute("contenteditable", "false");
      replica.setAttribute("aria-hidden", "true");
      replica.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
      replica.querySelectorAll("img").forEach((image) => {
        const placeholder = document.createElement("span");
        placeholder.className = "page-thumbnail-image";
        placeholder.setAttribute("aria-hidden", "true");
        placeholder.style.width = `${image.offsetWidth || 80}px`;
        placeholder.style.height = `${image.offsetHeight || 56}px`;
        image.replaceWith(placeholder);
      });
      const rect = sheet.getBoundingClientRect();
      const width = rect.width || 720;
      const height = rect.height || 960;
      const scale = Math.min(68 / width, 92 / height);
      replica.style.width = `${width}px`;
      replica.style.minHeight = `${height}px`;
      replica.style.maxWidth = "none";
      replica.style.margin = "0";
      replica.style.padding = getComputedStyle(sheet).padding;
      replica.style.transform = `scale(${scale})`;
      replica.style.transformOrigin = "top left";
      replica.style.pointerEvents = "none";
      preview.append(replica);

      const label = document.createElement("span");
      label.className = "page-thumbnail-label";
      label.textContent = `Page ${index + 1}`;
      button.append(preview, label);
      list.append(button);
    });
    $("#break-navigation-empty").hidden = sheets.length > 0;
  }
  function scheduleEditorPagination() {
    clearTimeout(editorPaginationTimer);
    editorPaginationTimer = setTimeout(paginateEditor, 120);
  }
  function paginateEditor() {
    if (editor.contentEditable !== "true" || $("#editor-card").classList.contains("landing")) return;
    const existing = [...editor.children];
    const nodes = existing.flatMap((child) => child.classList?.contains("document-sheet") ? [...child.childNodes] : [child]);
    const minHeight = parseFloat(getComputedStyle(editor).getPropertyValue("--paper-min-height")) || editor.clientHeight || 900;
    const probe = existing.find((child) => child.classList?.contains("document-sheet"));
    const style = probe ? getComputedStyle(probe) : getComputedStyle(editor);
    const capacity = Math.max(120, minHeight - parseFloat(style.paddingTop || 0) - parseFloat(style.paddingBottom || 0));
    const pages = [];
    let page = [];
    let used = 0;
    const flush = () => { if (page.length) pages.push(page); page = []; used = 0; };
    for (const node of nodes) {
      const isBreak = node.nodeType === Node.ELEMENT_NODE && node.matches('hr[data-page-break="true"]');
      if (isBreak) {
        if (!page.length) page = [];
        page.push(node);
        flush();
        continue;
      }
      const rectHeight = node.nodeType === Node.ELEMENT_NODE ? node.getBoundingClientRect().height : 0;
      const nodeStyle = node.nodeType === Node.ELEMENT_NODE ? getComputedStyle(node) : null;
      const blockHeight = rectHeight + (nodeStyle ? parseFloat(nodeStyle.marginTop || 0) + parseFloat(nodeStyle.marginBottom || 0) : 0);
      if (!isBreak && page.length && used + blockHeight > capacity) flush();
      page.push(node);
      used += blockHeight;
    }
    flush();
    if (!pages.length) pages.push([]);
    const oldSheets = existing.filter((child) => child.classList?.contains("document-sheet"));
    updatePageNumberLabels(oldSheets, pages.length);
    const unchanged = oldSheets.length === pages.length && pages.every((items, index) =>
      items.length === oldSheets[index].childNodes.length && items.every((node, childIndex) => node === oldSheets[index].childNodes[childIndex]));
    if (unchanged) { renderPageNavigation(); return; }
    $("#editor-card").classList.add("paper-layout");
    const fragment = document.createDocumentFragment();
    pages.forEach((items, index) => {
      const sheet = document.createElement("div");
      sheet.className = "document-sheet";
      sheet.dataset.editorPage = "true";
      sheet.setAttribute("role", "group");
      sheet.setAttribute("aria-label", `Page ${index + 1}`);
      items.forEach((node) => sheet.append(node));
      fragment.append(sheet);
    });
    updatePageNumberLabels([...fragment.children], pages.length);
    editor.replaceChildren(fragment);
    renderPageNavigation();
    $("#page-count").textContent = `${pages.length} ${pages.length === 1 ? "page" : "pages"}`;
  }
  function normalizeReviewComments(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && typeof item.quote === "string" && typeof item.body === "string")
      .slice(0, 500)
      .map((item) => ({
        id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
        start: Number.isInteger(item.start) && item.start >= 0 ? item.start : 0,
        quote: item.quote.slice(0, 4000),
        before: typeof item.before === "string" ? item.before.slice(-32) : "",
        after: typeof item.after === "string" ? item.after.slice(0, 32) : "",
        body: item.body.slice(0, 2000),
        author: "You",
        createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
        resolved: Boolean(item.resolved),
      }))
      .filter((item) => item.quote.trim() && item.body.trim());
  }

  function editorText() {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let text = "";
    let node;
    while ((node = walker.nextNode())) text += node.nodeValue;
    return text;
  }

  function editorOffset(node, offset) {
    if (!node || (node !== editor && !editor.contains(node))) return -1;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.setEnd(node, offset);
    return range.toString().length;
  }

  function rangeAtTextOffsets(start, end) {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let total = 0;
    let startPoint;
    let endPoint;
    let node;
    while ((node = walker.nextNode())) {
      const next = total + node.nodeValue.length;
      if (!startPoint && start <= next) startPoint = { node, offset: Math.max(0, start - total) };
      if (end <= next) { endPoint = { node, offset: Math.max(0, end - total) }; break; }
      total = next;
    }
    if (!startPoint || !endPoint) return null;
    const range = document.createRange();
    range.setStart(startPoint.node, Math.min(startPoint.offset, startPoint.node.nodeValue.length));
    range.setEnd(endPoint.node, Math.min(endPoint.offset, endPoint.node.nodeValue.length));
    return range;
  }

  function findTextMatches(query, matchCase) {
    if (!query) return { matches: [], total: 0 };
    const escaped = [...query].map((character) => "\\^$.*+?()[]{}|".includes(character) ? "\\" + character : character).join("");
    const matcher = new RegExp(escaped, matchCase ? "g" : "gi");
    const text = editorText();
    const matches = [];
    let total = 0;
    let result;
    while ((result = matcher.exec(text)) !== null) {
      total++;
      if (matches.length < FIND_MATCH_LIMIT) matches.push({ start: result.index, end: result.index + result[0].length });
      if (!result[0].length) matcher.lastIndex++;
    }
    return { matches, total };
  }

  function clearFindHighlights() {
    if (typeof CSS !== "undefined" && CSS.highlights) {
      CSS.highlights.delete("adigun-find");
      CSS.highlights.delete("adigun-find-current");
    }
  }

  function updateFindHighlights() {
    if (typeof CSS === "undefined" || !CSS.highlights || typeof Highlight === "undefined") return;
    const ranges = findMatches.map((match) => rangeAtTextOffsets(match.start, match.end)).filter(Boolean);
    const current = currentFindIndex >= 0 ? rangeAtTextOffsets(findMatches[currentFindIndex].start, findMatches[currentFindIndex].end) : null;
    if (ranges.length) CSS.highlights.set("adigun-find", new Highlight(...ranges));
    else CSS.highlights.delete("adigun-find");
    if (current) CSS.highlights.set("adigun-find-current", new Highlight(current));
    else CSS.highlights.delete("adigun-find-current");
  }

  function updateFindStatus() {
    const status = $("#find-count");
    if (!status) return;
    const query = $("#find-query").value;
    if (!query) status.textContent = "Enter text to find.";
    else if (!findMatchTotal) status.textContent = "No matches.";
    else {
      const totalLabel = findMatchTotal > FIND_MATCH_LIMIT ? `${FIND_MATCH_LIMIT.toLocaleString()}+ matches` : `${findMatchTotal} match${findMatchTotal === 1 ? "" : "es"}`;
      const position = currentFindIndex >= 0 ? `Match ${currentFindIndex + 1} of ${totalLabel}.` : totalLabel;
      status.textContent = findMatchTotal > FIND_MATCH_LIMIT ? `${position} Narrow the search to replace all.` : position;
    }
    const hasMatches = findMatches.length > 0;
    $("#find-previous").disabled = !hasMatches;
    $("#find-next").disabled = !hasMatches;
    $("#replace-current").disabled = !hasMatches;
    $("#replace-all").disabled = !hasMatches || findMatchTotal > FIND_MATCH_LIMIT;
  }

  function refreshFindMatches(reset = false) {
    const result = findTextMatches($("#find-query").value, $("#find-match-case").checked);
    findMatches = result.matches;
    findMatchTotal = result.total;
    if (reset) currentFindIndex = findMatches.length ? 0 : -1;
    else if (findMatches.length) currentFindIndex = Math.min(Math.max(currentFindIndex, 0), findMatches.length - 1);
    else currentFindIndex = -1;
    updateFindHighlights();
    updateFindStatus();
  }

  function showFindMatch(index) {
    const match = findMatches[index];
    const range = match && rangeAtTextOffsets(match.start, match.end);
    if (!range) return;
    const rect = range.getBoundingClientRect();
    if (rect.width || rect.height) window.scrollBy({ top: rect.top - 140, behavior: "smooth" });
    updateFindHighlights();
    updateFindStatus();
  }

  function navigateFindMatch(direction) {
    if (!findMatches.length) { refreshFindMatches(true); return; }
    currentFindIndex = (currentFindIndex + direction + findMatches.length) % findMatches.length;
    showFindMatch(currentFindIndex);
  }

  function openFindDialog() {
    if (activePdfFile || $("#editor-card").classList.contains("landing") || editor.hidden) {
      notify("Open an editable document to use Find and replace.");
      return;
    }
    const selection = window.getSelection();
    if (selection?.toString() && editor.contains(selection.anchorNode)) $("#find-query").value = selection.toString().slice(0, 2000);
    $("#find-dialog").showModal();
    refreshFindMatches(true);
    if (findMatches.length) showFindMatch(0);
    $("#find-query").focus();
    $("#find-query").select();
  }

  function replaceFindMatch(match, replacement, reopenDialog = true) {
    const dialog = $("#find-dialog");
    const shouldReopen = dialog.open && reopenDialog;
    if (dialog.open) dialog.close();
    const range = rangeAtTextOffsets(match.start, match.end);
    if (!range) { if (shouldReopen) dialog.showModal(); return false; }
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editor.focus({ preventScroll: true });
    const before = editorText();
    const expected = before.slice(0, match.start) + replacement + before.slice(match.end);
    document.execCommand("insertText", false, replacement);
    if (editorText() !== expected) {
      if (shouldReopen) dialog.showModal();
      return false;
    }
    countWords();
    saveDocument();
    if (shouldReopen) dialog.showModal();
    return true;
  }

  function reviewCommentRange(comment, text = editorText()) {
    const quote = comment.quote;
    let start = comment.start;
    if (text.slice(start, start + quote.length) !== quote) {
      const matches = [];
      let cursor = text.indexOf(quote);
      while (cursor !== -1) { matches.push(cursor); cursor = text.indexOf(quote, cursor + 1); }
      if (matches.length === 1) start = matches[0];
      else if (matches.length > 1) {
        const score = (index) => {
          const before = text.slice(Math.max(0, index - comment.before.length), index);
          const after = text.slice(index + quote.length, index + quote.length + comment.after.length);
          let beforeMatch = 0;
          while (beforeMatch < before.length && before[before.length - 1 - beforeMatch] === comment.before[comment.before.length - 1 - beforeMatch]) beforeMatch++;
          let afterMatch = 0;
          while (afterMatch < after.length && after[afterMatch] === comment.after[afterMatch]) afterMatch++;
          return beforeMatch + afterMatch;
        };
        const ranked = matches.map((index) => ({ index, score: score(index) })).sort((a, b) => b.score - a.score);
        if (ranked[0].score === 0 || ranked[0].score === ranked[1].score) return null;
        start = ranked[0].index;
      } else return null;
    }
    return rangeAtTextOffsets(start, start + quote.length);
  }

  function updateReviewHighlights() {
    if (typeof CSS === "undefined" || !CSS.highlights || typeof Highlight === "undefined") return;
    const text = editorText();
    const ranges = reviewComments.filter((comment) => !comment.resolved).map((comment) => reviewCommentRange(comment, text)).filter(Boolean);
    if (ranges.length) CSS.highlights.set("adigun-review-comments", new Highlight(...ranges));
    else CSS.highlights.delete("adigun-review-comments");
  }

  function renderReviewComments() {
    const list = $("#review-comment-list");
    if (!list) return;
    list.replaceChildren();
    const openCount = reviewComments.filter((comment) => !comment.resolved).length;
    $("#review-comment-count").textContent = `${reviewComments.length} comments · ${openCount} open`;
    const query = reviewSearch.trim().toLocaleLowerCase();
    const sorted = [...reviewComments]
      .filter((comment) => reviewFilter === "all" || (reviewFilter === "resolved") === comment.resolved)
      .filter((comment) => !query || `${comment.quote} ${comment.body} ${comment.author}`.toLocaleLowerCase().includes(query))
      .sort((a, b) => b.createdAt - a.createdAt);
    for (const comment of sorted) {
      const card = document.createElement("article");
      card.className = "review-comment";
      const heading = document.createElement("div");
      heading.className = "review-comment-meta";
      const author = document.createElement("strong");
      author.textContent = comment.author;
      const time = document.createElement("time");
      const date = new Date(comment.createdAt);
      time.textContent = Number.isNaN(date.getTime()) ? "Saved locally" : date.toLocaleDateString();
      heading.append(author, time);
      const quote = document.createElement("p");
      quote.className = "review-comment-quote";
      quote.textContent = `“${comment.quote}”`;
      const body = document.createElement("p");
      body.className = "review-comment-body";
      body.textContent = comment.body;
      const actions = document.createElement("div");
      actions.className = "review-comment-actions";
      const go = document.createElement("button");
      go.type = "button";
      go.className = "review-comment-link";
      go.dataset.commentGo = comment.id;
      go.textContent = "Go to text";
      const resolve = document.createElement("button");
      resolve.type = "button";
      resolve.className = "review-comment-resolve";
      resolve.dataset.commentResolve = comment.id;
      resolve.textContent = comment.resolved ? "Reopen" : "Resolve";
      actions.append(go, resolve);
      card.append(heading, quote, body, actions);
      if (comment.resolved) card.classList.add("resolved");
      list.append(card);
    }
    const empty = $("#review-comments-empty");
    empty.hidden = sorted.length > 0;
    empty.textContent = reviewComments.length
      ? "No comments match these filters."
      : "Select text and use Review → Add comment to start a discussion.";
    updateReviewHighlights();
    renderTrackedChanges();
  }

  function showReviewPanel(open = true) {
    const panel = $("#review-comments");
    if (!panel) return;
    panel.hidden = !open;
    $("#editor-layout").classList.toggle("has-review", open);
    if (open) {
      $("#document-outline").classList.remove("mobile-open");
      $("#toggle-outline").setAttribute("aria-expanded", "false");
      renderReviewComments();
    }
  }

  function trackedRevisionNodes() {
    return [...editor.querySelectorAll("ins[data-revision-id], del[data-revision-id]")];
  }

  function renderTrackedChanges() {
    const list = $("#tracked-revision-list");
    if (!list) return;
    const revisions = trackedRevisionNodes();
    $("#tracked-revision-count").textContent = `${revisions.length} pending ${revisions.length === 1 ? "change" : "changes"}`;
    list.replaceChildren();
    for (const revision of revisions) {
      const card = document.createElement("article");
      card.className = "tracked-revision";
      const meta = document.createElement("div");
      meta.className = "tracked-revision-meta";
      const label = document.createElement("strong");
      label.textContent = revision.tagName.toLowerCase() === "ins" ? "Inserted text" : "Deleted text";
      const author = document.createElement("span");
      author.textContent = revision.dataset.revisionAuthor || "You";
      meta.append(label, author);
      const quote = document.createElement("p");
      quote.className = "tracked-revision-quote";
      quote.textContent = revision.textContent || "(empty text)";
      const actions = document.createElement("div");
      actions.className = "tracked-revision-actions";
      for (const [action, text] of [["accept", "Accept"], ["reject", "Reject"]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.revisionAction = action;
        button.dataset.revisionId = revision.dataset.revisionId;
        button.textContent = text;
        actions.append(button);
      }
      card.append(meta, quote, actions);
      list.append(card);
    }
    $("#tracked-revisions-empty").hidden = revisions.length > 0;
    for (const action of ["accept-all", "reject-all"]) {
      const button = document.querySelector(`[data-revision-action="${action}"]`);
      if (button) button.disabled = revisions.length === 0;
    }
  }

  function settleTrackedRevision(revision, accept) {
    if (!revision?.parentNode) return;
    if (revision.tagName.toLowerCase() === "ins") {
      if (accept) revision.replaceWith(...revision.childNodes);
      else revision.remove();
    } else if (revision.tagName.toLowerCase() === "del") {
      if (accept) revision.remove();
      else revision.replaceWith(...revision.childNodes);
    }
  }

  function resolveTrackedRevision(id, action) {
    const revision = trackedRevisionNodes().find((item) => item.dataset.revisionId === id);
    if (!revision) return;
    settleTrackedRevision(revision, action === "accept");
    renderTrackedChanges();
    renderReviewComments();
    saveDocument();
    countWords();
  }

  function resolveAllTrackedRevisions(accept) {
    const revisions = trackedRevisionNodes();
    for (const revision of revisions) settleTrackedRevision(revision, accept);
    renderTrackedChanges();
    renderReviewComments();
    saveDocument();
    countWords();
    notify(`${accept ? "Accepted" : "Rejected"} ${revisions.length} pending ${revisions.length === 1 ? "change" : "changes"}.`);
  }

  function createTrackedRevision(tag, content) {
    const revision = document.createElement(tag);
    revision.dataset.revisionId = crypto.randomUUID();
    revision.dataset.revisionAuthor = "You";
    revision.dataset.revisionCreatedAt = String(Date.now());
    if (typeof content === "string") revision.textContent = content;
    else revision.append(content);
    return revision;
  }

  function handleTrackedBeforeInput(event) {
    if (!trackChangesEnabled || editor.contentEditable !== "true" || event.isComposing) return;
    const type = event.inputType;
    const isBackwardDelete = type === "deleteContentBackward";
    const isForwardDelete = type === "deleteContentForward";
    const isInsert = type === "insertText" || type === "insertFromPaste";
    if (!isBackwardDelete && !isForwardDelete && !isInsert) return;
    const value = isInsert ? (type === "insertFromPaste" ? event.dataTransfer?.getData("text/plain") || event.data || "" : event.data || "") : "";
    if (isInsert && (!value || /[\r\n]/.test(value))) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) return;
    const range = selection.getRangeAt(0).cloneRange();
    const startNode = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    const existingRevision = startNode?.closest("[data-revision-id]");
    if (existingRevision) {
      if (existingRevision.tagName.toLowerCase() === "del" && isInsert && range.collapsed) {
        range.setStartAfter(existingRevision);
        range.collapse(true);
      } else return;
    }
    if (range.cloneContents().querySelector?.("[data-revision-id]")) return;
    const blockSelector = "p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,pre";
    if (range.collapsed && !isInsert) {
      const textNode = range.startContainer;
      if (textNode.nodeType !== Node.TEXT_NODE) return;
      if (isBackwardDelete && range.startOffset > 0) range.setStart(textNode, range.startOffset - 1);
      else if (isForwardDelete && range.startOffset < textNode.nodeValue.length) range.setEnd(textNode, range.startOffset + 1);
      else return;
    }
    const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    const endElement = range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer : range.endContainer.parentElement;
    const startBlock = startElement?.closest(blockSelector);
    const endBlock = endElement?.closest(blockSelector);
    if (!startBlock || startBlock !== endBlock || range.toString().length > 4000) return;
    event.preventDefault();
    if (!range.collapsed) {
      const deleted = range.extractContents();
      if (deleted.textContent) {
        const deletion = createTrackedRevision("del", deleted);
        range.insertNode(deletion);
        range.setStartAfter(deletion);
        range.collapse(true);
      }
    }
    if (isInsert) {
      const previousNode = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer.childNodes[range.startOffset - 1] : null;
      if (previousNode?.tagName?.toLowerCase() === "ins" && previousNode.dataset.revisionAuthor === "You") {
        previousNode.append(document.createTextNode(value));
        range.setStartAfter(previousNode);
      } else {
        const insertion = createTrackedRevision("ins", value);
        range.insertNode(insertion);
        range.setStartAfter(insertion);
      }
      range.collapse(true);
    }
    selection.removeAllRanges();
    selection.addRange(range);
    renderTrackedChanges();
    countWords();
    saveDocument();
  }

  function openCommentDialog() {
    const selection = window.getSelection();
    if (editor.contentEditable !== "true" || !selection?.rangeCount || selection.isCollapsed || !editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) {
      notify("Select text in the document before adding a comment.");
      return;
    }
    const range = selection.getRangeAt(0);
    const start = editorOffset(range.startContainer, range.startOffset);
    const end = editorOffset(range.endContainer, range.endOffset);
    const text = editorText();
    const quote = text.slice(start, end);
    if (start < 0 || end <= start || !quote.trim()) {
      notify("Select text in the document before adding a comment.");
      return;
    }
    if (quote.length > 4000) { notify("Select 4,000 characters or fewer to anchor a comment."); return; }
    pendingReviewAnchor = {
      start,
      quote,
      before: text.slice(Math.max(0, start - 32), start),
      after: text.slice(end, end + 32),
    };
    $("#comment-quote").textContent = `“${quote}”`;
    $("#comment-text").value = "";
    $("#comment-dialog").showModal();
    $("#comment-text").focus();
  }

  function goToReviewComment(id) {
    const comment = reviewComments.find((item) => item.id === id);
    const range = comment && reviewCommentRange(comment);
    if (!range) { notify("The commented text could not be found in this document."); return; }
    editor.focus({ preventScroll: true });
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const element = range.startContainer.parentElement;
    element?.scrollIntoView({ block: "center", behavior: "auto" });
  }

  function saveDocument(force = false) {
    clearTimeout(saveTimer);
    if (!autosave && !force) { setSaveStatus("Autosave off"); return; }
    if (!database) { setSaveStatus("Local save unavailable"); return; }
    setSaveStatus("Saving…", true);
    const documentId = activeId;
    const documentTitle = title();
    const savedComments = reviewComments.map((comment) => ({ ...comment }));
    const content = documentModel.fromDOM(editor);
    saveTimer = setTimeout(() => {
      const tx = database.transaction("documents", "readwrite");
      tx.objectStore("documents").put({ id: documentId, title: documentTitle, content, contentFormat: documentModel.format, reviewComments: savedComments, trackChanges: trackChangesEnabled, layout: { paper: paperSize, orientation: pageOrientation, margins: pageMargins, pageNumbers: pageNumbersEnabled, header: pageHeaderText, footer: pageFooterText }, updatedAt: Date.now(), kind: "document" });
      tx.oncomplete = () => { if (activeId === documentId) { setSaveStatus("Saved"); countWords(); } };
      tx.onerror = () => { if (activeId === documentId) { setSaveStatus("Save failed"); notify("Could not save this document on your device."); } };
    }, 280);
  }

  function setTitle(value) {
    titleInput.value = value || "Untitled document";
    $("#stage-title").textContent = title();
  }

  function setWorkspaceMode(mode) {
    const isDocument = mode === "document";
    const isConversion = mode === "conversion";
    $("#conversion-workspace").hidden = !isConversion;
    if (!isConversion) { editor.hidden = false; $(".page-footer").hidden = false; }
    $("#document-ruler").hidden = !isDocument;
    if (!isDocument) $("#editor-card").classList.remove("paper-layout");
    editor.contentEditable = String(isDocument);
    titleInput.readOnly = !isDocument;
    $("#editor-layout").classList.toggle("has-outline", isDocument);
    if (!isDocument) { $("#review-comments").hidden = true; $("#editor-layout").classList.remove("has-review"); }
    $("#document-outline").classList.toggle("visible", isDocument);
    if (!isDocument) { $("#document-outline").classList.remove("mobile-open"); $("#review-comments").hidden = true; $("#editor-layout").classList.remove("has-review"); }
    $("#toggle-outline").hidden = !isDocument;
    $("#toggle-outline").setAttribute("aria-expanded", "false");
    $(".ribbon-tabs").hidden = !isDocument;
    ribbon.hidden = !isDocument;
    $("#undo").hidden = !isDocument;
    $("#redo").hidden = !isDocument;
    $("#save-document").hidden = !isDocument;
    $("#export-html").hidden = ["list", "landing", "conversion"].includes(mode);
    $("#export-docx").hidden = !isDocument;
    $("#export-html").lastElementChild.textContent = mode === "pdf" ? "Download PDF" : "Export HTML";
    if (isConversion) { editor.hidden = true; $(".page-footer").hidden = true; }
    updateParagraphRuler();
  }

  function setMobileMenu(open) {
    const nav = $("#workspace-nav");
    const button = $("#mobile-menu");
    nav.classList.toggle("mobile-open", open);
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Close workspace menu" : "Open workspace menu");
  }

  function openFilePicker(accept = acceptedFileTypes) {
    filePicker.value = "";
    filePicker.accept = accept;
    filePicker.click();
  }

  const documentTemplates = {
    meeting: {
      title: "Meeting notes",
      name: "Meeting notes",
      content: "<h1>Meeting notes</h1><p><strong>Date:</strong> [Date] · <strong>Attendees:</strong> [Names]<br><strong>Agenda:</strong> [Topics]<br><strong>Notes:</strong> [Discussion]<br><strong>Decisions:</strong> [Decision]<br><strong>Actions:</strong> [Task — owner — due date]</p>",
    },
    project: {
      title: "Project brief",
      name: "Project brief",
      content: "<h1>Project brief</h1><p><strong>Owner:</strong> [Name] · <strong>Date:</strong> [Date]<br><strong>Objective:</strong> [Outcome]<br><strong>Scope and deliverables:</strong> [Add details]<br><strong>Milestones:</strong> [Milestone — target date]<br><strong>Risks and questions:</strong> [Add details]</p>",
    },
    letter: {
      title: "Formal letter",
      name: "Formal letter",
      content: "<h1>Formal letter</h1><p>[Your name] · [Address] · [Date]<br>To: [Recipient name] · Subject: [Subject]<br><br>Dear [Recipient name],<br>[Write your message here.]<br><br>Yours sincerely,<br>[Your name]</p>",
    },
  };

  function createDocument(template) {
    activePdfFile = undefined;
    if (pdfUrl) { URL.revokeObjectURL(pdfUrl); pdfUrl = undefined; }
    $("#pdf-frame")?.remove();
    activeId = crypto.randomUUID();
    applyPageLayout();
    reviewComments = [];
    trackChangesEnabled = false;
    updateRibbonSelection();
    showReviewPanel(false);
    renderReviewComments();
    setTitle(template?.title || "Untitled document");
    setWorkspaceMode("document");
    $("#file-kind").textContent = "New document";
    $("#editor-card").classList.remove("pdf-preview");
    $("#editor-card").classList.remove("landing");
    editor.hidden = false;
    editor.innerHTML = template?.content || "<p><br></p>";
    editor.focus();
    countWords();
    saveDocument();
    notify(template ? `${template.name} template opened.` : "Blank document created.");
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
    editor.innerHTML = '<section class="landing-page"><span class="landing-kicker">ADIGUNFREEDOCEDITOR</span><h2>Your documents.<br>Your workspace.</h2><p>Create a document or open one of the file types supported in this first workspace.</p><div class="landing-actions"><button class="landing-primary" type="button" id="landing-create">Create blank document</button><button class="landing-secondary" type="button" id="landing-open-word">Open Word document</button><button class="landing-secondary" type="button" id="landing-open-pdf">Open PDF</button></div><section class="landing-templates" aria-labelledby="landing-templates-title"><div class="landing-recents-heading"><div><span class="landing-kicker">START WITH A TEMPLATE</span><h3 id="landing-templates-title">A useful first page</h3></div></div><div class="landing-template-grid"><button class="landing-template" type="button" data-template="meeting"><span class="landing-template-icon" aria-hidden="true">▤</span><strong>Meeting notes</strong><small>Agenda, decisions and action items</small></button><button class="landing-template" type="button" data-template="project"><span class="landing-template-icon" aria-hidden="true">◇</span><strong>Project brief</strong><small>Objective, scope and milestones</small></button><button class="landing-template" type="button" data-template="letter"><span class="landing-template-icon" aria-hidden="true">✉</span><strong>Formal letter</strong><small>Recipient, subject and message</small></button></div></section><button class="landing-dropzone" type="button" id="landing-open-file" aria-label="Choose or drop a Word, PDF, text, Markdown, or HTML file"><span class="landing-dropzone-icon" aria-hidden="true">↥</span><span class="landing-dropzone-copy"><strong>Choose a file or drop it here</strong><small>DOCX · PDF · TXT · Markdown · HTML</small></span></button><section class="landing-recents" id="landing-recents" aria-labelledby="landing-recents-title"><div class="landing-recents-heading"><div><span class="landing-kicker">ON THIS DEVICE</span><h3 id="landing-recents-title">Recent documents</h3></div><button class="landing-all" type="button" id="landing-all">View all</button></div><p class="landing-recents-empty">Loading saved documents…</p></section><div class="landing-details"><div><strong>Work stays here</strong><span>Editable document text is saved in this browser. No account or cloud sync is active.</span></div><div><strong>Supported in this build</strong><span>Import Word structure, edit TXT, Markdown and HTML, or view and download PDF</span></div></div></section>';
    loadLandingRecentDocuments();
  }

  async function loadLandingRecentDocuments() {
    const container = $("#landing-recents");
    if (!container) return;
    try {
      const documents = (await getDocuments()).filter((doc) => !doc.deleted).slice(0, 4);
      if (!documents.length) {
        container.innerHTML = '<div class="landing-recents-heading"><div><span class="landing-kicker">ON THIS DEVICE</span><h3 id="landing-recents-title">Recent documents</h3></div></div><p class="landing-recents-empty">Your saved documents will appear here. Create a document or open a file to get started.</p>';
        return;
      }
      const rows = documents.map((doc) => {
        const updated = new Date(doc.updatedAt);
        const updatedLabel = Number.isNaN(updated.getTime()) ? "Saved on this device" : `Edited ${updated.toLocaleDateString()}`;
        return `<li><button class="landing-document" type="button" data-open-id="${escapeHTML(doc.id)}"><span class="landing-document-icon" aria-hidden="true">▤</span><span class="landing-document-copy"><strong>${escapeHTML(doc.title || "Untitled document")}</strong><time>${updatedLabel}</time></span><span class="landing-document-open" aria-hidden="true">Open&nbsp;→</span></button></li>`;
      }).join("");
      container.innerHTML = `<div class="landing-recents-heading"><div><span class="landing-kicker">ON THIS DEVICE</span><h3 id="landing-recents-title">Recent documents</h3></div><button class="landing-all" type="button" id="landing-all">View all</button></div><ul class="landing-document-list">${rows}</ul>`;
    } catch {
      container.innerHTML = '<div class="landing-recents-heading"><div><span class="landing-kicker">ON THIS DEVICE</span><h3 id="landing-recents-title">Recent documents</h3></div></div><p class="landing-recents-empty">Saved documents could not be loaded in this browser.</p>';
    }
  }

  function showConversionWorkspace() {
    setWorkspaceMode("conversion");
    $("#editor-card").classList.remove("landing", "pdf-preview");
    $("#stage-title").textContent = "Convert files";
    setTitle("Convert files");
    $("#file-kind").textContent = "Runs locally in this browser";
    $("#page-count").textContent = "DOCX, TXT, Markdown, HTML → HTML or Word";
    $("#word-count").textContent = "Choose a source file";
    renderConversionState();
  }

  function renderConversionState() {
    const selected = conversionSourceFile;
    $("#conversion-source-name").textContent = selected ? selected.name : "No source selected";
    $("#conversion-source-type").textContent = selected ? selected.name.split(".").pop().toUpperCase() : "Choose DOCX, TXT, Markdown, or HTML";
    $("#conversion-run").disabled = !selected;
    $("#conversion-progress").textContent = selected ? "Ready to convert." : "Select a local file to begin.";
    clearConversionResult();
  }

  function clearConversionResult() {
    conversionOutputBlob = undefined;
    conversionOutputName = "";
    $("#conversion-download").disabled = true;
    $("#conversion-result-name").textContent = "";
    $("#conversion-warning").hidden = true;
    $("#conversion-warning").textContent = "";
    $("#conversion-preview").hidden = true;
    $("#conversion-preview").removeAttribute("srcdoc");
  }

  function selectConversionSource(file) {
    if (!file) return;
    const extension = file.name.split(".").pop().toLowerCase();
    if (!(["docx", "txt", "md", "markdown", "html", "htm"].includes(extension))) {
      notify("Convert supports DOCX, TXT, Markdown, and HTML sources. PDF is view-only.");
      return;
    }
    conversionSourceFile = file;
    renderConversionState();
  }

  function conversionHTMLFromText(text) {
    return String(text).replace(/\r\n?/g, "\n").split("\n").map((line) => "<p>" + (escapeHTML(line) || "<br>") + "</p>").join("") || "<p><br></p>";
  }

  async function runConversion() {
    if (!conversionSourceFile) return;
    const file = conversionSourceFile;
    const extension = file.name.split(".").pop().toLowerCase();
    const target = $("#conversion-target").value;
    const warnings = [];
    $("#conversion-run").disabled = true;
    clearConversionResult();
    $("#conversion-progress").textContent = "Reading source file…";
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      let html;
      if (extension === "docx") {
        if (file.size > 20 * 1024 * 1024) throw new Error("Word documents must be 20 MB or smaller.");
        if (!window.mammoth?.convertToHtml) throw new Error("The local Word import module did not load. Reload the page and try again.");
        const arrayBuffer = await file.arrayBuffer();
        inspectDocxArchive(arrayBuffer);
        const converted = await window.mammoth.convertToHtml({ arrayBuffer });
        const sanitized = sanitizeDocxHtml(converted.value);
        html = sanitized.html || "<p><br></p>";
        const warningCount = converted.messages.filter((message) => message.type === "warning").length;
        if (warningCount) warnings.push(warningCount + " Word compatibility warning" + (warningCount === 1 ? "" : "s") + ".");
        if (sanitized.removed) warnings.push(sanitized.removed + " unsupported or unsafe item" + (sanitized.removed === 1 ? " was" : "s were") + " omitted.");
        warnings.push("Word page layout and advanced formatting are not retained in this conversion.");
      } else {
        if (file.size > 12 * 1024 * 1024) throw new Error("Text and HTML sources must be 12 MB or smaller.");
        const text = await file.text();
        const plain = ["html", "htm"].includes(extension) ? new DOMParser().parseFromString(text, "text/html").body.innerText : text;
        html = conversionHTMLFromText(plain);
        if (["md", "markdown"].includes(extension)) warnings.push("Markdown is preserved as plain text; its formatting is not rendered.");
        else if (["html", "htm"].includes(extension)) warnings.push("HTML is converted to plain text; source formatting is not preserved.");
      }
      $("#conversion-progress").textContent = "Building a preview and downloadable output…";
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const preview = document.createElement("div");
      preview.innerHTML = html;
      const previewDocument = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:15px/1.6 Arial,sans-serif;color:#182035;padding:24px;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #c6cdd8;padding:6px}</style></head><body>' + html + "</body></html>";
      if (target === "docx") {
        const wordPackage = makeWordPackage(preview, { paper: defaultPageLayout.paper, orientation: defaultPageLayout.orientation, margins: defaultPageLayout.margins, pageNumbers: false, header: "", footer: "" });
        if (wordPackage.unsupported.length) {
          warnings.push("Word output omits unsupported content: " + wordPackage.unsupported.join(", ") + ".");
          if (!window.confirm("This conversion cannot preserve: " + wordPackage.unsupported.join(", ") + ". Continue and download a reduced Word file?")) {
            $("#conversion-progress").textContent = "Conversion cancelled; no file was downloaded.";
            return;
          }
        }
        conversionOutputBlob = makeStoredZip(wordPackage.files);
        conversionOutputName = safeFilename(file.name.replace(/\.[^.]+$/, "")) + ".docx";
        warnings.push("Word output uses the new-document page setup defaults.");
      } else {
        conversionOutputBlob = new Blob([previewDocument], { type: "text/html;charset=utf-8" });
        conversionOutputName = safeFilename(file.name.replace(/\.[^.]+$/, "")) + ".html";
      }
      $("#conversion-preview").srcdoc = previewDocument;
      $("#conversion-preview").hidden = false;
      $("#conversion-result-name").textContent = conversionOutputName;
      $("#conversion-download").disabled = false;
      if (warnings.length) {
        $("#conversion-warning").textContent = warnings.join(" ");
        $("#conversion-warning").hidden = false;
      }
      $("#conversion-progress").textContent = "Conversion complete. Review the preview, then download the output.";
    } catch (error) {
      $("#conversion-progress").textContent = "Conversion failed: " + error.message;
    } finally {
      $("#conversion-run").disabled = !conversionSourceFile;
    }
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
    const allowedTags = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "u", "s", "strike", "del", "ul", "ol", "li", "a", "br", "hr", "blockquote", "pre", "code", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "img"]);
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
      if (tag === "hr" && node.getAttribute("data-page-break") === "true") element.setAttribute("data-page-break", "true");
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
      applyPageLayout(doc.layout);
      reviewComments = normalizeReviewComments(doc.reviewComments);
      trackChangesEnabled = Boolean(doc.trackChanges);
      updateRibbonSelection();
      showReviewPanel(false);
      setTitle(doc.title);
      setWorkspaceMode("document");
      $("#editor-card").classList.remove("landing");
      $("#file-kind").textContent = "Saved on this device";
      const content = typeof doc.content === "string" ? documentModel.fromHTML(doc.content) : documentModel.normalize(doc.content);
      editor.innerHTML = documentModel.toHTML(content) || "<p><br></p>";
      editor.hidden = false;
      renderReviewComments();
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
        applyPageLayout();
        reviewComments = [];
        showReviewPanel(false);
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
    applyPageLayout();
    reviewComments = [];
    trackChangesEnabled = false;
    updateRibbonSelection();
    showReviewPanel(false);
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
    pageCanvasDimensions = "";
    applyPaperCanvasMinimumHeight();
    $("#zoom-value").textContent = `${zoom}%`;
  }

  function fitToWidth() {
    if (editor.contentEditable !== "true" || $("#editor-card").classList.contains("landing")) return;
    const container = editor.parentElement;
    if (!container) return;
    const previousZoom = editor.style.zoom;
    editor.style.zoom = "100%";
    const pageWidth = editor.getBoundingClientRect().width;
    const availableWidth = container.clientWidth;
    editor.style.zoom = previousZoom;
    if (!pageWidth || !availableWidth) return;
    setZoom(Math.round((availableWidth / pageWidth) * 100));
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
          control.dataset.tool = tool.select;
          control.setAttribute("aria-label", tool.label);
          for (const [value, label] of tool.options) {
            const option = document.createElement("option"); option.value = value; option.textContent = label; control.append(option);
          }
          if (tool.select === "paper") control.value = paperSize;
          if (tool.select === "margins") control.value = pageMargins;
          control.addEventListener("change", () => {
            if (tool.select === "font" && control.value) runCommand("fontName", control.value);
            if (tool.select === "text-color" && control.value) runCommand("foreColor", control.value);
            if (tool.select === "highlight-color" && control.value) runCommand("hiliteColor", control.value);
            if (tool.select === "line-spacing") applyParagraphSpacing("line", control.value);
            if (tool.select === "paragraph-spacing") applyParagraphSpacing("paragraph", control.value);
            if (tool.select === "block") runCommand("formatBlock", `<${control.value}>`);
            if (tool.select === "size") runCommand("fontSize", control.value);
            if (tool.select === "paper") setPaper(control.value);
            if (tool.select === "margins") setPageMargins(control.value);
          });
        } else {
          control = document.createElement("button");
          control.type = "button"; control.className = "tool-button"; control.dataset.action = tool.action; control.textContent = tool.action === "orientation" && pageOrientation === "landscape" ? "▭ Landscape" : tool.icon; control.title = tool.label; control.setAttribute("aria-label", tool.label);
          if (tool.pressed || ["page-numbers", "track-changes"].includes(tool.action)) control.setAttribute("aria-pressed", tool.action === "page-numbers" ? String(pageNumbersEnabled) : tool.action === "track-changes" ? String(trackChangesEnabled) : "false");
          control.addEventListener("click", () => runTool(tool.action, control));
        }
        section.append(control);
      }
      ribbon.append(section);
    }
    updateRibbonSelection();
  }

  function updateRibbonSelection() {
    const selection = window.getSelection();
    const focusNode = selection?.focusNode || selection?.anchorNode;
    const anchorNode = selection?.anchorNode;
    const inEditor = (node) => node && (node === editor || editor.contains(node));
    const tableCell = selectedTableCell();
    for (const button of ribbon.querySelectorAll('.tool-button[data-action^="table-"]')) button.disabled = !tableCell;
    const trackingButton = ribbon.querySelector('.tool-button[data-action="track-changes"]');
    if (trackingButton) trackingButton.setAttribute("aria-pressed", String(trackChangesEnabled));
    if (tableCell) {
      const table = tableCell.closest("table");
      const rows = table ? [...table.querySelectorAll("tr")].filter((item) => item.closest("table") === table) : [];
      const deleteRowButton = ribbon.querySelector('.tool-button[data-action="table-row-delete"]');
      const deleteColumnButton = ribbon.querySelector('.tool-button[data-action="table-column-delete"]');
      const verticalMerges = hasVerticalMerges(table);
      for (const action of ["table-row-above", "table-row-below", "table-column-left", "table-column-right", "table-row-delete", "table-column-delete"]) {
        const button = ribbon.querySelector('.tool-button[data-action="' + action + '"]');
        if (button) button.disabled = verticalMerges;
      }
      if (deleteRowButton) deleteRowButton.disabled = verticalMerges || rows.length <= 1;
      if (deleteColumnButton) deleteColumnButton.disabled = verticalMerges || rows.some((row) => row.cells.length - (tableCell.cellIndex < row.cells.length ? 1 : 0) < 1);
      const mergeButton = ribbon.querySelector('.tool-button[data-action="table-merge"]');
      if (mergeButton) mergeButton.disabled = selectedTableCells().length < 2;
      const verticalMergeButton = ribbon.querySelector('.tool-button[data-action="table-merge-vertical"]');
      if (verticalMergeButton) verticalMergeButton.disabled = selectedVerticalTableCells().length < 2;
      const splitButton = ribbon.querySelector('.tool-button[data-action="table-split"]');
      if (splitButton) splitButton.disabled = (Number(tableCell.getAttribute("colspan")) || 1) <= 1 && (Number(tableCell.getAttribute("rowspan")) || 1) <= 1;
    }
    updateParagraphRuler();
    if (!inEditor(focusNode) && !inEditor(anchorNode)) return;
    const contextNode = inEditor(focusNode) ? focusNode : anchorNode;
    const focusElement = contextNode.nodeType === Node.ELEMENT_NODE ? contextNode : contextNode.parentElement;
    const block = focusElement?.closest("h1,h2,h3,h4,h5,h6,p,li,th,td,blockquote,pre");
    const blockSelect = ribbon.querySelector("[data-tool=block]");
    if (blockSelect) {
      const tag = block?.tagName.toLowerCase();
      blockSelect.value = ["h1", "h2", "h3"].includes(tag) ? tag : "p";
    }
    const familySelect = ribbon.querySelector("[data-tool=font]");
    const fontNode = focusElement?.closest("span[data-font-family],font[face]");
    const fontFamily = supportedFontFamily(fontNode?.getAttribute("data-font-family") || fontNode?.getAttribute("face") || document.queryCommandValue("fontName"));
    if (familySelect) familySelect.value = fontFamily;
    const textColorSelect = ribbon.querySelector("[data-tool=text-color]");
    const textColorNode = focusElement?.closest("[data-text-color],font[color]");
    const currentTextColor = supportedColor(textColorNode?.getAttribute("data-text-color") || textColorNode?.getAttribute("color") || textColorNode?.style?.color || document.queryCommandValue("foreColor"));
    if (textColorSelect) textColorSelect.value = currentTextColor;
    const highlightColorSelect = ribbon.querySelector("[data-tool=highlight-color]");
    const highlightNode = focusElement?.closest("[data-highlight-color],span[style*='background-color']");
    const currentHighlight = supportedColor(highlightNode?.getAttribute("data-highlight-color") || highlightNode?.style?.backgroundColor || document.queryCommandValue("hiliteColor"));
    if (highlightColorSelect) highlightColorSelect.value = currentHighlight;
    const lineSpacingSelect = ribbon.querySelector("[data-tool=line-spacing]");
    if (lineSpacingSelect) lineSpacingSelect.value = block?.getAttribute("data-line-spacing") || "";
    const paragraphSpacingSelect = ribbon.querySelector("[data-tool=paragraph-spacing]");
    if (paragraphSpacingSelect) paragraphSpacingSelect.value = block?.getAttribute("data-paragraph-spacing") || "";
    const indentLevels = selectedParagraphBlocks().map((item) => Number(item.getAttribute("data-indent-level")) || 0);
    const outdentButton = ribbon.querySelector('.tool-button[data-action="outdent"]');
    const indentButton = ribbon.querySelector('.tool-button[data-action="indent"]');
    if (outdentButton) outdentButton.disabled = !indentLevels.some((level) => level > 0);
    if (indentButton) indentButton.disabled = !indentLevels.some((level) => level < 4);
    const fontSelect = ribbon.querySelector("[data-tool=size]");
    const fontSize = document.queryCommandValue("fontSize");
    if (fontSelect && [...fontSelect.options].some((option) => option.value === fontSize)) fontSelect.value = fontSize;
    for (const action of ["bold", "italic", "underline", "strikeThrough"]) {
      const button = ribbon.querySelector('.tool-button[data-action=' + action + ']');
      if (button) button.setAttribute("aria-pressed", String(document.queryCommandState(action)));
    }
    for (const [action, selector] of [["insertUnorderedList", "ul"], ["insertOrderedList", "ol"]]) {
      const button = ribbon.querySelector('.tool-button[data-action=' + action + ']');
      if (button) button.setAttribute("aria-pressed", String(Boolean(focusElement?.closest(selector))));
    }
    const alignmentTarget = block || editor;
    const textAlign = getComputedStyle(alignmentTarget).textAlign;
    const direction = getComputedStyle(alignmentTarget).direction;
    const alignments = {
      justifyLeft: textAlign === "left" || (textAlign === "start" && direction !== "rtl"),
      justifyCenter: textAlign === "center",
      justifyFull: textAlign === "justify",
      justifyRight: textAlign === "right" || (textAlign === "start" && direction === "rtl"),
    };
    for (const [action, pressed] of Object.entries(alignments)) {
      const button = ribbon.querySelector('.tool-button[data-action=' + action + ']');
      if (button) button.setAttribute("aria-pressed", String(pressed));
    }
  }

  function tableGridRows(table) {
    const rows = [...table.querySelectorAll("tr")].filter((row) => row.closest("table") === table);
    const occupied = rows.map(() => new Map());
    const layouts = [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const entries = [];
      let column = 0;
      for (const cell of rows[rowIndex].cells) {
        const span = Math.max(1, Number(cell.getAttribute("colspan")) || 1);
        while (Array.from({ length: span }, (_, offset) => column + offset).some((slot) => occupied[rowIndex].has(slot))) column++;
        const rowSpan = Math.max(1, Number(cell.getAttribute("rowspan")) || 1);
        entries.push({ cell, start: column, span, rowSpan });
        for (let down = rowIndex; down < Math.min(rows.length, rowIndex + rowSpan); down++) {
          for (let across = column; across < column + span; across++) occupied[down].set(across, cell);
        }
        column += span;
      }
      layouts.push({ row: rows[rowIndex], entries });
    }
    return layouts;
  }

  function hasVerticalMerges(table) {
    return tableGridRows(table).some((layout) => layout.entries.some((entry) => entry.rowSpan > 1));
  }

  function selectedTableCell() {
    const selection = window.getSelection();
    const node = selection?.focusNode || selection?.anchorNode;
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    const cell = element?.closest("th,td");
    return cell && editor.contains(cell) ? cell : null;
  }

  function selectedTableCells() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return [];
    const range = selection.getRangeAt(0);
    const cellFor = (node) => {
      const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
      const cell = element?.closest("th,td");
      return cell && editor.contains(cell) ? cell : null;
    };
    const startCell = cellFor(range.startContainer);
    const endCell = cellFor(range.endContainer);
    if (!startCell || !endCell || startCell.closest("table") !== endCell.closest("table") || startCell.parentElement !== endCell.parentElement) return [];
    const firstIndex = startCell.cellIndex;
    const lastIndex = endCell.cellIndex;
    if (lastIndex <= firstIndex) return [];
    const cells = [...startCell.parentElement.cells].slice(firstIndex, lastIndex + 1);
    if (cells.length < 2 || cells.some((cell) => !range.intersectsNode(cell) || cell.rowSpan > 1)) return [];
    return cells;
  }

  function selectedVerticalTableCells() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return [];
    const range = selection.getRangeAt(0);
    const cellFor = (node) => {
      const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
      const cell = element?.closest("th,td");
      return cell && editor.contains(cell) ? cell : null;
    };
    const startCell = cellFor(range.startContainer);
    const endCell = cellFor(range.endContainer);
    const table = startCell?.closest("table");
    if (!table || table !== endCell?.closest("table")) return [];
    const layouts = tableGridRows(table);
    const firstRow = layouts.findIndex((layout) => layout.row === startCell.parentElement);
    const lastRow = layouts.findIndex((layout) => layout.row === endCell.parentElement);
    if (firstRow < 0 || lastRow <= firstRow) return [];
    const first = layouts[firstRow].entries.find((entry) => entry.cell === startCell);
    const last = layouts[lastRow].entries.find((entry) => entry.cell === endCell);
    if (!first || !last || first.start !== last.start || first.span !== 1 || last.span !== 1 || first.rowSpan !== 1 || last.rowSpan !== 1) return [];
    const cells = [];
    for (let rowIndex = firstRow; rowIndex <= lastRow; rowIndex++) {
      const matches = layouts[rowIndex].entries.filter((entry) => entry.start === first.start);
      if (matches.length !== 1 || matches[0].span !== 1 || matches[0].rowSpan !== 1 || !range.intersectsNode(matches[0].cell)) return [];
      cells.push(matches[0].cell);
    }
    return cells.length > 1 ? cells : [];
  }

  function selectedParagraphBlocks() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) return [];
    const range = selection.getRangeAt(0);
    const focusNode = selection.focusNode || selection.anchorNode;
    return [...editor.querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,th,td")].filter((block) => range.collapsed ? block.contains(focusNode) : range.intersectsNode(block));
  }

  function setParagraphIndent(level) {
    const selection = window.getSelection();
    const hasEditorSelection = Boolean(selection?.rangeCount && editor.contains(selection.anchorNode));
    const blocks = (hasEditorSelection ? selectedParagraphBlocks() : paragraphRulerBlocks)
      .filter((block) => editor.contains(block));
    const range = hasEditorSelection ? selection.getRangeAt(0).cloneRange() : paragraphRulerRange?.cloneRange();
    if (!blocks.length || !range) {
      notify("Place the cursor in a paragraph or select paragraph text first.");
      return;
    }
    const indentLevel = Math.max(0, Math.min(4, Math.round(Number(level) || 0)));
    for (const block of blocks) {
      if (indentLevel) {
        block.setAttribute("data-indent-level", String(indentLevel));
        block.style.marginLeft = `${indentLevel * 36}pt`;
      } else {
        block.removeAttribute("data-indent-level");
        block.style.marginLeft = "";
      }
    }
    paragraphRulerBlocks = blocks;
    paragraphRulerRange = range;
    editor.focus();
    selection.removeAllRanges();
    if (editor.contains(range.startContainer) && editor.contains(range.endContainer)) selection.addRange(range);
    updateRibbonSelection();
    countWords();
    saveDocument();
  }

  function updateParagraphRuler() {
    const ruler = $("#paragraph-indent-ruler");
    if (!ruler) return;
    const selection = window.getSelection();
    if (editor.contentEditable === "true" && selection?.rangeCount && editor.contains(selection.anchorNode)) {
      const selectedBlocks = selectedParagraphBlocks();
      if (selectedBlocks.length) {
        paragraphRulerBlocks = selectedBlocks;
        paragraphRulerRange = selection.getRangeAt(0).cloneRange();
      }
    }
    const blocks = editor.contentEditable === "true" ? paragraphRulerBlocks.filter((block) => editor.contains(block)) : [];
    const levels = blocks.map((block) => Number(block.getAttribute("data-indent-level")) || 0);
    ruler.disabled = !levels.length;
    const mixed = levels.some((level) => level !== levels[0]);
    const level = levels.length ? Math.max(0, Math.min(4, Math.round(levels.reduce((sum, value) => sum + value, 0) / levels.length))) : 0;
    ruler.value = String(level);
    ruler.setAttribute("aria-valuetext", mixed ? "Mixed paragraph indents" : `${level * 0.5} inches`);
    $("#paragraph-indent-value").textContent = mixed ? "Mixed" : `${level * 0.5} in`;
    ruler.dataset.mixed = String(mixed);
  }

  function applyParagraphIndent(amount) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) {
      notify("Place the cursor in a paragraph or select paragraph text first.");
      return;
    }
    const range = selection.getRangeAt(0).cloneRange();
    const blocks = selectedParagraphBlocks();
    if (!blocks.length) {
      notify("Place the cursor in a paragraph or select paragraph text first.");
      return;
    }
    for (const block of blocks) {
      const current = Number(block.getAttribute("data-indent-level")) || 0;
      const next = Math.max(0, Math.min(4, current + amount));
      if (next) { block.setAttribute("data-indent-level", String(next)); block.style.marginLeft = `${next * 36}pt`; }
      else { block.removeAttribute("data-indent-level"); block.style.marginLeft = ""; }
    }
    editor.focus();
    selection.removeAllRanges();
    selection.addRange(range);
    updateRibbonSelection();
    countWords();
    saveDocument();
  }

  function applyParagraphSpacing(kind, value) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) {
      notify("Place the cursor in a paragraph or select paragraph text first.");
      return;
    }
    const range = selection.getRangeAt(0).cloneRange();
    const focusNode = selection.focusNode || selection.anchorNode;
    const selector = "p,h1,h2,h3,h4,h5,h6,li,th,td";
    const blocks = [...editor.querySelectorAll(selector)].filter((block) => range.collapsed ? block.contains(focusNode) : range.intersectsNode(block));
    if (!blocks.length) {
      notify("Place the cursor in a paragraph or select paragraph text first.");
      return;
    }
    for (const block of blocks) {
      if (kind === "line") {
        if (value === "") { block.removeAttribute("data-line-spacing"); block.style.lineHeight = ""; }
        else { block.setAttribute("data-line-spacing", value); block.style.lineHeight = value; }
      } else if (value === "") {
        block.removeAttribute("data-paragraph-spacing"); block.style.marginBottom = "";
      } else {
        block.setAttribute("data-paragraph-spacing", value); block.style.marginBottom = `${value}pt`;
      }
    }
    editor.focus();
    selection.removeAllRanges();
    selection.addRange(range);
    updateRibbonSelection();
    countWords();
    saveDocument();
  }

  function runCommand(command, value) {
    editor.focus();
    document.execCommand(command, false, value || null);
    updateRibbonSelection();
    countWords(); saveDocument();
  }

  function insertTableRow(position) {
    const activeCell = selectedTableCell();
    if (!activeCell) { notify("Place the cursor in a table cell first."); return; }
    const row = activeCell.closest("tr");
    const table = row?.closest("table");
    if (!row || !table) return;
    if (hasVerticalMerges(table)) { notify("Split vertically merged cells before changing table rows or columns."); return; }
    const rows = [...table.querySelectorAll("tr")].filter((item) => item.closest("table") === table);
    if (rows.length >= 1000) { notify("Tables are limited to 1,000 rows."); return; }
    const newRow = document.createElement("tr");
    const headerRow = row.parentElement.tagName === "THEAD" && position === "above";
    for (let index = 0; index < row.cells.length; index++) {
      const cell = document.createElement(headerRow ? "th" : "td");
      cell.innerHTML = "<p><br></p>";
      newRow.append(cell);
    }
    if (row.parentElement.tagName === "THEAD" && position === "below") {
      let body = table.tBodies[0];
      if (!body) { body = document.createElement("tbody"); table.append(body); }
      body.insertBefore(newRow, body.firstElementChild);
    } else {
      row.insertAdjacentElement(position === "above" ? "beforebegin" : "afterend", newRow);
    }
    focusTableCell(newRow.cells[0]);
    notify("Inserted a row " + position + ".");
  }

  function insertTableColumn(position) {
    const activeCell = selectedTableCell();
    if (!activeCell) { notify("Place the cursor in a table cell first."); return; }
    const row = activeCell.closest("tr");
    const table = row?.closest("table");
    if (!row || !table) return;
    if (hasVerticalMerges(table)) { notify("Split vertically merged cells before changing table rows or columns."); return; }
    const rows = [...table.querySelectorAll("tr")].filter((item) => item.closest("table") === table);
    if (rows.some((item) => item.cells.length >= 50)) { notify("Tables are limited to 50 columns."); return; }
    const targetIndex = activeCell.cellIndex + (position === "right" ? 1 : 0);
    let firstInsertedCell;
    for (const tableRow of rows) {
      const newCell = document.createElement(tableRow.parentElement.tagName === "THEAD" ? "th" : "td");
      newCell.innerHTML = "<p><br></p>";
      tableRow.insertBefore(newCell, tableRow.cells[targetIndex] || null);
      if (tableRow === row) firstInsertedCell = newCell;
    }
    if (firstInsertedCell) focusTableCell(firstInsertedCell);
    notify("Inserted a column " + position + ".");
  }

  function mergeTableCells() {
    const cells = selectedTableCells();
    if (cells.length < 2) { notify("Select adjacent cells in one row first."); return; }
    const totalSpan = cells.reduce((sum, cell) => sum + (Number(cell.getAttribute("colspan")) || 1), 0);
    if (totalSpan > 50) { notify("A merged cell cannot span more than 50 columns."); return; }
    const firstCell = cells[0];
    for (const cell of cells.slice(1)) {
      while (cell.firstChild) firstCell.append(cell.firstChild);
      cell.remove();
    }
    if (totalSpan > 1) firstCell.setAttribute("colspan", String(totalSpan));
    else firstCell.removeAttribute("colspan");
    focusTableCell(firstCell);
    notify("Merged " + cells.length + " adjacent cells.");
  }

  function mergeTableCellsVertically() {
    const cells = selectedVerticalTableCells();
    if (cells.length < 2) { notify("Select adjacent cells in one column first."); return; }
    const firstCell = cells[0];
    for (const cell of cells.slice(1)) {
      while (cell.firstChild) firstCell.append(cell.firstChild);
      cell.remove();
    }
    firstCell.setAttribute("rowspan", String(cells.length));
    focusTableCell(firstCell);
    notify("Merged " + cells.length + " cells vertically.");
  }

  function splitTableCell() {
    const cell = selectedTableCell();
    if (!cell) { notify("Place the cursor in a table cell first."); return; }
    const span = Number(cell.getAttribute("colspan")) || 1;
    const rowSpan = Number(cell.getAttribute("rowspan")) || 1;
    if (span <= 1 && rowSpan > 1) {
      const layouts = tableGridRows(cell.closest("table"));
      const rowIndex = layouts.findIndex((layout) => layout.row === cell.parentElement);
      const entry = layouts[rowIndex]?.entries.find((item) => item.cell === cell);
      const nextLayout = layouts[rowIndex + 1];
      if (!entry || !nextLayout || rowIndex + rowSpan > layouts.length) { notify("The merged cell cannot be split at this table boundary."); return; }
      cell.removeAttribute("rowspan");
      const newCell = document.createElement(cell.tagName.toLowerCase());
      if (rowSpan - 1 > 1) newCell.setAttribute("rowspan", String(rowSpan - 1));
      newCell.innerHTML = "<p><br></p>";
      const nextEntry = nextLayout.entries.find((item) => item.start >= entry.start);
      nextLayout.row.insertBefore(newCell, nextEntry?.cell || null);
      focusTableCell(newCell);
      notify("Split the vertical merge at the next row.");
      return;
    }
    if (span <= 1) { notify("Select a merged cell to split."); return; }
    const firstSpan = Math.ceil(span / 2);
    const secondSpan = span - firstSpan;
    const newCell = document.createElement(cell.tagName.toLowerCase());
    if (cell.hasAttribute("rowspan")) newCell.setAttribute("rowspan", cell.getAttribute("rowspan"));
    if (firstSpan > 1) cell.setAttribute("colspan", String(firstSpan));
    else cell.removeAttribute("colspan");
    if (secondSpan > 1) newCell.setAttribute("colspan", String(secondSpan));
    newCell.innerHTML = "<p><br></p>";
    cell.after(newCell);
    focusTableCell(newCell);
    notify("Split the merged cell into two cells.");
  }

  function deleteTableRow() {
    const activeCell = selectedTableCell();
    if (!activeCell) { notify("Place the cursor in a table cell first."); return; }
    if (hasVerticalMerges(activeCell.closest("table"))) { notify("Split vertically merged cells before changing table rows or columns."); return; }
    const row = activeCell.closest("tr");
    const table = row?.closest("table");
    if (!row || !table) return;
    const rows = [...table.querySelectorAll("tr")].filter((item) => item.closest("table") === table);
    if (rows.length <= 1) { notify("A table must keep at least one row."); return; }
    const rowIndex = rows.indexOf(row);
    const cellIndex = activeCell.cellIndex;
    const removeHeader = row.parentElement.tagName === "THEAD";
    row.remove();
    let focusTarget;
    if (removeHeader) {
      const promoted = table.tBodies[0]?.rows[0];
      if (promoted) {
        for (const oldCell of [...promoted.cells]) {
          const newCell = document.createElement("th");
          for (const attribute of [...oldCell.attributes]) newCell.setAttribute(attribute.name, attribute.value);
          while (oldCell.firstChild) newCell.append(oldCell.firstChild);
          oldCell.replaceWith(newCell);
        }
        (table.tHead || table.createTHead()).append(promoted);
        focusTarget = promoted.cells[Math.min(cellIndex, promoted.cells.length - 1)];
      }
    }
    if (!focusTarget) {
      const remaining = [...table.querySelectorAll("tr")].filter((item) => item.closest("table") === table);
      const targetRow = remaining[Math.min(rowIndex, remaining.length - 1)];
      focusTarget = targetRow?.cells[Math.min(cellIndex, (targetRow?.cells.length || 1) - 1)];
    }
    if (focusTarget) focusTableCell(focusTarget);
    notify("Deleted the table row.");
  }

  function deleteTableColumn() {
    const activeCell = selectedTableCell();
    if (!activeCell) { notify("Place the cursor in a table cell first."); return; }
    if (hasVerticalMerges(activeCell.closest("table"))) { notify("Split vertically merged cells before changing table rows or columns."); return; }
    const row = activeCell.closest("tr");
    const table = row?.closest("table");
    if (!row || !table) return;
    const rows = [...table.querySelectorAll("tr")].filter((item) => item.closest("table") === table);
    const cellIndex = activeCell.cellIndex;
    if (rows.some((item) => item.cells.length - (cellIndex < item.cells.length ? 1 : 0) < 1)) {
      notify("A table must keep at least one column in every row.");
      return;
    }
    for (const tableRow of rows) if (tableRow.cells[cellIndex]) tableRow.deleteCell(cellIndex);
    focusTableCell(row.cells[Math.min(cellIndex, row.cells.length - 1)]);
    notify("Deleted the table column.");
  }

  function deleteTable() {
    const activeCell = selectedTableCell();
    const table = activeCell?.closest("table");
    if (!table) { notify("Place the cursor in a table cell first."); return; }
    const paragraph = document.createElement("p");
    paragraph.innerHTML = "<br>";
    table.replaceWith(paragraph);
    focusTableCell(paragraph);
    notify("Deleted the table.");
  }

  function focusTableCell(cell) {
    const paragraph = cell?.querySelector("p") || cell;
    if (!paragraph) return;
    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(paragraph, 0);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    countWords();
    saveDocument();
    updateRibbonSelection();
  }

  function runTool(action, button) {
    switch (action) {
      case "page-numbers": setPageNumbers(!pageNumbersEnabled, button); break;
      case "track-changes":
        trackChangesEnabled = !trackChangesEnabled;
        button.setAttribute("aria-pressed", String(trackChangesEnabled));
        if (trackChangesEnabled) showReviewPanel(true);
        saveDocument();
        notify(trackChangesEnabled ? "Track changes on. Text insertions and deletions will be reviewable." : "Track changes off.");
        break;
      case "page-header-footer": openPageHeaderFooterDialog(); break;
      case "indent": applyParagraphIndent(1); break;
      case "outdent": applyParagraphIndent(-1); break;
      case "table-row-above": insertTableRow("above"); break;
      case "table-row-below": insertTableRow("below"); break;
      case "table-column-left": insertTableColumn("left"); break;
      case "table-column-right": insertTableColumn("right"); break;
      case "table-row-delete": deleteTableRow(); break;
      case "table-column-delete": deleteTableColumn(); break;
      case "table-delete": deleteTable(); break;
      case "table-merge": mergeTableCells(); break;
      case "table-merge-vertical": mergeTableCellsVertically(); break;
      case "table-split": splitTableCell(); break;
      case "undo": case "redo": case "bold": case "italic": case "underline": case "strikeThrough": case "insertUnorderedList": case "insertOrderedList": case "justifyLeft": case "justifyCenter": case "justifyRight": case "justifyFull": case "removeFormat": case "unlink":
        runCommand(action); break;
      case "link": {
        const url = window.prompt("Enter a link URL (https://…)");
        if (url && /^https?:\/\//i.test(url)) runCommand("createLink", url);
        else if (url) notify("Use a full https:// or http:// link.");
        break;
      }
      case "date": runCommand("insertText", new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date())); break;
      case "divider": runCommand("insertHTML", "<hr><p><br></p>"); break;
      case "page-break": runCommand("insertHTML", '<hr data-page-break="true"><p><br></p>'); notify("Manual page break inserted."); break;
      case "table": {
        const selection = window.getSelection();
        tableInsertionRange = selection && selection.rangeCount && editor.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
        $("#table-dialog").showModal();
        $("#table-rows").focus();
        break;
      }
      case "image": {
        const selection = window.getSelection();
        imageInsertionRange = selection && selection.rangeCount && editor.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
        imagePicker.click();
        break;
      }
      case "orientation": pageOrientation = pageOrientation === "portrait" ? "landscape" : "portrait"; $("#editor-card").classList.toggle("landscape", pageOrientation === "landscape"); button.textContent = pageOrientation === "portrait" ? "▯ Portrait" : "▭ Landscape"; pageCanvasDimensions = ""; applyPaperCanvasMinimumHeight(); saveDocument(); break;
      case "add-comment": openCommentDialog(); break;
      case "show-comments": showReviewPanel(true); break;
      case "spellcheck": editor.spellcheck = !editor.spellcheck; button.setAttribute("aria-pressed", String(editor.spellcheck)); notify(`Browser spellcheck ${editor.spellcheck ? "on" : "off"}.`); break;
      case "wordcount": notify($("#word-count").textContent); break;
      case "zoom-out": setZoom(zoom - 10); break;
      case "zoom-in": setZoom(zoom + 10); break;
      case "zoom-reset": setZoom(100); break;
      case "zoom-fit": fitToWidth(); break;
      case "find": openFindDialog(); break;
      case "assistant": toggleAssistant(); break;
    }
  }

  function applyPaperCanvasMinimumHeight() {
    const card = $("#editor-card");
    if (card.classList.contains("landing") || editor.contentEditable !== "true") {
      editor.style.minHeight = "";
      editor.style.removeProperty("--paper-min-height");
      pageCanvasDimensions = "";
      return;
    }
    const width = editor.clientWidth;
    if (!width) return;
    const ratio = paperSize === "letter"
      ? (pageOrientation === "landscape" ? 11 / 8.5 : 8.5 / 11)
      : (pageOrientation === "landscape" ? 297 / 210 : 210 / 297);
    const key = `${paperSize}:${pageOrientation}:${width}`;
    if (key === pageCanvasDimensions) return;
    pageCanvasDimensions = key;
    editor.style.setProperty("--paper-min-height", `${Math.ceil(width / ratio)}px`);
    editor.style.minHeight = "";
  }

  function applyPageLayout(layout = defaultPageLayout) {
    paperSize = layout.paper === "letter" ? "letter" : "a4";
    pageNumbersEnabled = Boolean(layout.pageNumbers);
    pageHeaderText = typeof layout.header === "string" ? layout.header.slice(0, 180) : "";
    pageFooterText = typeof layout.footer === "string" ? layout.footer.slice(0, 180) : "";
    pageOrientation = layout.orientation === "landscape" ? "landscape" : "portrait";
    pageMargins = ["narrow", "wide"].includes(layout.margins) ? layout.margins : "normal";
    const card = $("#editor-card");
    card.classList.toggle("paper-letter", paperSize === "letter");
    card.classList.toggle("landscape", pageOrientation === "landscape");
    card.classList.toggle("margin-narrow", pageMargins === "narrow");
    card.classList.toggle("margin-wide", pageMargins === "wide");
    const paperSelect = ribbon.querySelector('[data-tool="paper"]');
    const marginsSelect = ribbon.querySelector('[data-tool="margins"]');
    if (paperSelect) paperSelect.value = paperSize;
    if (marginsSelect) marginsSelect.value = pageMargins;
    const pageNumbersButton = ribbon.querySelector('[data-action="page-numbers"]');
    if (pageNumbersButton) pageNumbersButton.setAttribute("aria-pressed", String(pageNumbersEnabled));
    const orientationButton = ribbon.querySelector('[data-action="orientation"]');
    if (orientationButton) orientationButton.textContent = pageOrientation === "portrait" ? "▯ Portrait" : "▭ Landscape";
    pageCanvasDimensions = "";
    applyPaperCanvasMinimumHeight();
    scheduleEditorPagination();
  }

  function setPageNumbers(enabled, button) {
    pageNumbersEnabled = Boolean(enabled);
    if (button) button.setAttribute("aria-pressed", String(pageNumbersEnabled));
    scheduleEditorPagination();
    saveDocument();
  }

  function updatePageNumberLabels(sheets, total = sheets.length) {
    sheets.forEach((sheet, index) => {
      sheet.classList.toggle("page-numbered", pageNumbersEnabled);
      if (pageNumbersEnabled) sheet.dataset.pageNumber = `${index + 1} / ${total}`;
      else delete sheet.dataset.pageNumber;
      if (pageHeaderText) sheet.dataset.pageHeader = pageHeaderText;
      else delete sheet.dataset.pageHeader;
      if (pageFooterText) sheet.dataset.pageFooter = `${pageFooterText}${pageNumbersEnabled ? " · " : ""}`;
      else delete sheet.dataset.pageFooter;
      sheet.setAttribute("aria-label", `Page ${index + 1}${pageNumbersEnabled ? ` of ${total}` : ""}${pageHeaderText ? `, header ${pageHeaderText}` : ""}${pageFooterText ? `, footer ${pageFooterText}` : ""}`);
    });
  }

  function openPageHeaderFooterDialog() {
    $("#page-header-text").value = pageHeaderText;
    $("#page-footer-text").value = pageFooterText;
    $("#page-header-footer-dialog").showModal();
  }

  function setPageHeaderFooter(header, footer) {
    pageHeaderText = String(header || "").trim().slice(0, 180);
    pageFooterText = String(footer || "").trim().slice(0, 180);
    scheduleEditorPagination();
    saveDocument();
    notify("Page header and footer saved.");
  }

  function setPaper(size) {
    paperSize = size === "letter" ? "letter" : "a4";
    $("#editor-card").classList.toggle("paper-letter", paperSize === "letter");
    pageCanvasDimensions = "";
    applyPaperCanvasMinimumHeight();
    scheduleEditorPagination();
    saveDocument();
  }

  function setPageMargins(value) {
    pageMargins = ["narrow", "wide"].includes(value) ? value : "normal";
    $("#editor-card").classList.toggle("margin-narrow", pageMargins === "narrow");
    $("#editor-card").classList.toggle("margin-wide", pageMargins === "wide");
    scheduleEditorPagination();
    saveDocument();
  }

  function wordXmlText(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
  }

  function makeWordPackage(source = editor, pageLayout = null) {
    const exportLayout = pageLayout || { paper: $("#editor-card").classList.contains("paper-letter") ? "letter" : "a4", orientation: $("#editor-card").classList.contains("landscape") ? "landscape" : "portrait", margins: $("#editor-card").classList.contains("margin-narrow") ? "narrow" : $("#editor-card").classList.contains("margin-wide") ? "wide" : "normal", pageNumbers: pageNumbersEnabled, header: pageHeaderText, footer: pageFooterText };
    const relationships = [];
    const hyperlinkIds = new Map();
    const imageIds = new Map();
    const images = [];
    const unsupported = new Set();
    const exportableFontFamilies = new Set(["Arial", "Calibri", "Cambria", "Courier New", "Georgia", "Tahoma", "Times New Roman", "Verdana"]);
    const exportableTextColors = new Set(["#000000", "#404040", "#C00000", "#ED7D31", "#FFC000", "#548235", "#4472C4", "#7030A0", "#00B0F0", "#FFFFFF"]);
    const exportableHighlightColors = new Map([["#FFFF00", "yellow"], ["#00FF00", "green"], ["#00FFFF", "cyan"], ["#FF00FF", "magenta"], ["#0000FF", "blue"], ["#FF0000", "red"], ["#000080", "darkBlue"], ["#008080", "darkCyan"], ["#008000", "darkGreen"], ["#800080", "darkMagenta"], ["#800000", "darkRed"], ["#808000", "darkYellow"], ["#808080", "darkGray"], ["#C0C0C0", "lightGray"], ["#000000", "black"], ["#FFFFFF", "white"]]);
    function normalizeExportColor(value, palette) {
      const source = String(value || "").trim();
      const match = source.match(/^#?([\da-f]{6})$/i);
      const color = match ? "#" + match[1].toUpperCase() : "";
      return palette.has(color) ? color : "";
    }
    let nextRelationship = 3;
    let nextDrawing = 1;
    let nextRevision = 1;

    function serializeInline(node, marks = {}) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue.replace(/\s+/g, " ");
        if (!text) return "";
        const preserve = /^\s|\s$/.test(node.nodeValue) ? ' xml:space="preserve"' : "";
        const fontFamily = marks.fontFamily;
        const color = marks.textColor ? marks.textColor.slice(1) : "";
        const highlight = marks.highlightColor ? exportableHighlightColors.get(marks.highlightColor) : "";
        const properties = [fontFamily && `<w:rFonts w:ascii="${wordXmlText(fontFamily)}" w:hAnsi="${wordXmlText(fontFamily)}"/>`, color && `<w:color w:val="${wordXmlText(color)}"/>`, highlight && `<w:highlight w:val="${highlight}"/>`, marks.bold && "<w:b/>", marks.italic && "<w:i/>", marks.underline && '<w:u w:val="single"/>', marks.strike && "<w:strike/>"].filter(Boolean).join("");
        const textTag = marks.revisionType === "deletion" ? "w:delText" : "w:t";
        return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}<${textTag}${preserve}>${wordXmlText(text)}</${textTag}></w:r>`;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const tag = node.tagName.toLowerCase();
      if (tag === "br") return "<w:r><w:br/></w:r>";
      if (tag === "img") {
        const src = node.getAttribute("src") || "";
        const match = /^data:image\/(png|jpeg|gif);base64,([a-z0-9+/]+={0,2})$/i.exec(src);
        if (!match || src.length > 11 * 1024 * 1024) {
          unsupported.add("unsupported image formats");
          const alt = node.getAttribute("alt") || "";
          return alt ? `<w:r><w:t>${wordXmlText(alt)}</w:t></w:r>` : "";
        }
        let image = imageIds.get(src);
        if (!image) {
          const mime = `image/${match[1].toLowerCase()}`;
          const extension = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
          let binary;
          try { binary = atob(match[2]); } catch {
            unsupported.add("invalid embedded images");
            const alt = node.getAttribute("alt") || "";
            return alt ? `<w:r><w:t>${wordXmlText(alt)}</w:t></w:r>` : "";
          }
          const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
          const signature = mime === "image/png" ? [137, 80, 78, 71, 13, 10, 26, 10] : mime === "image/jpeg" ? [255, 216, 255] : [71, 73, 70, 56];
          const validSignature = signature.every((value, index) => bytes[index] === value) && (mime !== "image/gif" || bytes[4] === 55 && bytes[5] === 97 || bytes[4] === 57 && bytes[5] === 97);
          if (!validSignature) {
            unsupported.add("invalid embedded images");
            const alt = node.getAttribute("alt") || "";
            return alt ? `<w:r><w:t>${wordXmlText(alt)}</w:t></w:r>` : "";
          }
          const fileName = `image${images.length + 1}.${extension}`;
          const relationshipId = `rId${nextRelationship++}`;
          image = { fileName, mime, bytes, relationshipId };
          imageIds.set(src, image);
          images.push(image);
          relationships.push(`<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${fileName}"/>`);
        }
        const naturalWidth = node.naturalWidth || Number(node.getAttribute("width")) || 480;
        const naturalHeight = node.naturalHeight || Number(node.getAttribute("height")) || Math.round(naturalWidth * 0.75);
        const requestedWidth = Number(node.getAttribute("width")) || naturalWidth;
        const requestedHeight = Number(node.getAttribute("height")) || naturalHeight * requestedWidth / naturalWidth;
        const scale = Math.min(1, (tableContentWidth / 15) / requestedWidth);
        const cx = Math.max(1, Math.round(requestedWidth * scale * 9525));
        const cy = Math.max(1, Math.round(requestedHeight * scale * 9525));
        const drawingId = nextDrawing++;
        const alt = wordXmlText((node.getAttribute("alt") || image.fileName).slice(0, 300));
        return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${drawingId}" name="${image.fileName}" descr="${alt}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${drawingId}" name="${image.fileName}" descr="${alt}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr><pic:blipFill><a:blip r:embed="${image.relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
      }
      if (["script", "style", "button"].includes(tag)) return "";
      const next = { ...marks };
      const revisionType = ["ins", "del"].includes(tag) && node.getAttribute("data-revision-id") ? tag : "";
      if (revisionType) next.revisionType = revisionType === "del" ? "deletion" : "insertion";
      if (["b", "strong"].includes(tag)) next.bold = true;
      if (["i", "em"].includes(tag)) next.italic = true;
      if (tag === "u") next.underline = true;
      if (["s", "strike", "del"].includes(tag) && !revisionType) next.strike = true;
      const requestedFont = String(node.getAttribute("data-font-family") || node.getAttribute("face") || node.style?.fontFamily || "").split(",")[0].trim().replace(/^["\']|["\']$/g, "");
      const fontFamily = [...exportableFontFamilies].find((family) => family.toLowerCase() === requestedFont.toLowerCase());
      if (fontFamily) next.fontFamily = fontFamily;
      const textColor = normalizeExportColor(node.getAttribute("data-text-color") || node.getAttribute("color") || node.style?.color, exportableTextColors);
      if (textColor) next.textColor = textColor;
      const requestedHighlight = normalizeExportColor(node.getAttribute("data-highlight-color") || node.style?.backgroundColor || node.style?.background, new Set(exportableHighlightColors.keys()));
      if (requestedHighlight) next.highlightColor = requestedHighlight;
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
      if (revisionType) {
        const rawDate = Number(node.getAttribute("data-revision-created-at"));
        const revisionDate = Number.isFinite(rawDate) ? new Date(rawDate).toISOString() : new Date().toISOString();
        const author = wordXmlText((node.getAttribute("data-revision-author") || "You").slice(0, 80));
        return `<w:${revisionType} w:id="${nextRevision++}" w:author="${author}" w:date="${revisionDate}">${children}</w:${revisionType}>`;
      }
      return children;
    }

    const body = [];
    const letterPaper = exportLayout.paper === "letter";
    const landscapePaper = exportLayout.orientation === "landscape";
    let tablePageWidth = letterPaper ? 12240 : 11906;
    if (landscapePaper) tablePageWidth = letterPaper ? 15840 : 16838;
    const tableMarginTwips = exportLayout.margins === "narrow" ? 720 : exportLayout.margins === "wide" ? 2880 : 1440;
    const tableContentWidth = tablePageWidth - tableMarginTwips * 2;

    function addParagraph(element, listKind = "", listLevel = 0, output = body) {
      const tag = element.tagName.toLowerCase();
      const paragraphProperties = [];
      if (["h1", "h2", "h3"].includes(tag)) paragraphProperties.push('<w:pStyle w:val="Heading' + tag.slice(1) + '"/>');
      else if (["h4", "h5", "h6"].includes(tag)) { paragraphProperties.push('<w:pStyle w:val="Heading3"/>'); unsupported.add("heading levels 4–6"); }
      const align = ["left", "center", "right", "justify"].includes(element.style.textAlign) ? element.style.textAlign : "";
      if (align) paragraphProperties.push('<w:jc w:val="' + align + '"/>');
      const lineSpacing = { "1": 240, "1.15": 276, "1.5": 360, "2": 480 }[element.getAttribute?.("data-line-spacing") || ""];
      const paragraphSpacing = { "0": 0, "6": 120, "12": 240 }[element.getAttribute?.("data-paragraph-spacing") || ""];
      const spacing = [];
      if (lineSpacing) spacing.push(`w:line="${lineSpacing}" w:lineRule="auto"`);
      if (paragraphSpacing !== undefined) spacing.push(`w:after="${paragraphSpacing}"`);
      if (spacing.length) paragraphProperties.push(`<w:spacing ${spacing.join(" ")}/>`);
      const indentLevel = Number(element.getAttribute?.("data-indent-level")) || 0;
      if (indentLevel >= 1 && indentLevel <= 4) paragraphProperties.push(`<w:ind w:left="${indentLevel * 720}"/>`);
      if (listKind) paragraphProperties.push('<w:numPr><w:ilvl w:val="' + Math.min(listLevel, 8) + '"/><w:numId w:val="' + (listKind === "ol" ? 2 : 1) + '"/></w:numPr>');
      const marks = tag === "th" || element.closest("th") ? { bold: true } : {};
      const runs = [...element.childNodes].map((node) => serializeInline(node, marks)).join("") || "<w:r><w:t></w:t></w:r>";
      output.push("<w:p>" + (paragraphProperties.length ? "<w:pPr>" + paragraphProperties.join("") + "</w:pPr>" : "") + runs + "</w:p>");
    }

    function tableXml(table) {
      const rows = [...table.querySelectorAll("tr")].filter((row) => row.closest("table") === table);
      if (!rows.length) { unsupported.add("empty tables"); return ""; }
      const cellsByRow = rows.map((row) => [...row.children].filter((cell) => ["td", "th"].includes(cell.tagName.toLowerCase())));
      const layouts = [];
      let activeVertical = [];
      let columnCount = 0;
      let invalidWidth = false;

      rows.forEach((row, rowIndex) => {
        const occupied = new Set();
        const placements = [];
        for (const merge of activeVertical) {
          placements.push({ start: merge.start, span: merge.span, merge: "continue" });
          for (let column = merge.start; column < merge.start + merge.span; column++) occupied.add(column);
        }

        const nextVertical = activeVertical.filter((merge) => merge.remaining > 1)
          .map((merge) => ({ ...merge, remaining: merge.remaining - 1 }));
        for (const cell of cellsByRow[rowIndex]) {
          const span = Math.max(1, Math.min(50, cell.colSpan || 1));
          let start = 0;
          while (true) {
            while (occupied.has(start)) start++;
            let conflictOffset = -1;
            for (let offset = 1; offset < span; offset++) {
              if (occupied.has(start + offset)) { conflictOffset = offset; break; }
            }
            if (conflictOffset < 0) break;
            start += conflictOffset;
          }
          if (start + span > 50) { unsupported.add("tables over 50 columns"); invalidWidth = true; return; }
          for (let column = start; column < start + span; column++) occupied.add(column);

          const requestedRowSpan = Math.max(1, Math.min(50, cell.rowSpan || 1));
          const remainingRows = rows.length - rowIndex;
          const rowSpan = Math.min(requestedRowSpan, remainingRows);
          if (rowSpan < requestedRowSpan) unsupported.add("vertical spans beyond the final table row");
          placements.push({ start, span, cell, merge: rowSpan > 1 ? "restart" : "", rowSpan });
          if (rowSpan > 1) nextVertical.push({ start, span, remaining: rowSpan - 1 });
        }
        activeVertical = nextVertical;
        if (occupied.size) columnCount = Math.max(columnCount, Math.max(...occupied) + 1);
        layouts.push({ row, placements });
      });

      if (invalidWidth) return "";
      if (!columnCount || columnCount > 50 || rows.length > 1000) {
        unsupported.add("tables over 1,000 rows or 50 columns");
        return "";
      }
      const columnWidth = Math.floor(tableContentWidth / columnCount);
      const borders = ["top", "left", "bottom", "right", "insideH", "insideV"].map((side) => '<w:' + side + ' w:val="single" w:sz="4" w:space="0" w:color="C6CDD8"/>').join("");
      let xml = '<w:tbl><w:tblPr><w:tblW w:w="' + tableContentWidth + '" w:type="dxa"/><w:tblBorders>' + borders + '</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>';
      for (let column = 0; column < columnCount; column++) xml += '<w:gridCol w:w="' + columnWidth + '"/>';
      xml += '</w:tblGrid>';
      for (const layout of layouts) {
        const row = layout.row;
        const placements = new Map(layout.placements.map((placement) => [placement.start, placement]));
        xml += '<w:tr>' + (row.parentElement?.tagName.toLowerCase() === "thead" ? '<w:trPr><w:tblHeader w:val="true"/></w:trPr>' : "");
        let column = 0;
        while (column < columnCount) {
          const placement = placements.get(column);
          if (!placement) {
            xml += '<w:tc><w:tcPr><w:tcW w:w="' + columnWidth + '" w:type="dxa"/></w:tcPr><w:p/></w:tc>';
            column++;
            continue;
          }
          const span = Math.min(columnCount - column, placement.span);
          const width = columnWidth * span;
          if (placement.merge === "continue") {
            xml += '<w:tc><w:tcPr><w:tcW w:w="' + width + '" w:type="dxa"/>' + (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : "") + '<w:vMerge/></w:tcPr><w:p/></w:tc>';
          } else {
            const cell = placement.cell;
            const verticalMerge = placement.merge === "restart" ? '<w:vMerge w:val="restart"/>' : "";
            xml += '<w:tc><w:tcPr><w:tcW w:w="' + width + '" w:type="dxa"/>' + (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : "") + verticalMerge + '</w:tcPr>';
            const cellContent = [];
            if (cell.children.length) walkBlocks(cell, "", 0, cellContent);
            else addParagraph(cell, "", 0, cellContent);
            xml += cellContent.join("") || "<w:p/>";
            xml += "</w:tc>";
          }
          column += span;
        }
        xml += "</w:tr>";
      }
      return xml + "</w:tbl>";
    }
    function walkBlocks(node, listKind = "", listLevel = 0, output = body) {
      for (const child of [...node.children]) {
        const tag = child.tagName.toLowerCase();
        if (tag === "ul" || tag === "ol") { walkBlocks(child, tag, listLevel, output); continue; }
        if (tag === "li") {
          const inlineChildren = [...child.children].filter((item) => ["ul", "ol"].includes(item.tagName.toLowerCase()));
          if (listLevel > 0 || inlineChildren.length) unsupported.add("nested list hierarchy");
          const copy = child.cloneNode(true);
          for (const nested of [...copy.children]) if (["ul", "ol"].includes(nested.tagName.toLowerCase())) nested.remove();
          addParagraph(copy, listKind || "ul", 0, output);
          for (const nested of inlineChildren) walkBlocks(nested, nested.tagName.toLowerCase(), listLevel + 1, output);
          continue;
        }
        if (["p", "h1", "h2", "h3", "blockquote", "pre"].includes(tag)) {
          if (tag === "blockquote" || tag === "pre") unsupported.add(tag === "pre" ? "code blocks" : "block quotes");
          addParagraph(child, listKind, listLevel, output);
          continue;
        }
        if (tag === "table") { output.push(tableXml(child)); continue; }
        if (tag === "hr") { output.push(child.getAttribute("data-page-break") === "true" ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="808080"/></w:pBdr></w:pPr><w:r><w:t></w:t></w:r></w:p>'); continue; }
        if (child.children.length) walkBlocks(child, listKind, listLevel, output);
        else if (child.textContent.trim()) addParagraph(child, listKind, listLevel, output);
      }
    }
    walkBlocks(source);
    if (!body.length) body.push("<w:p><w:r><w:t></w:t></w:r></w:p>");

    const isLetter = exportLayout.paper === "letter";
    const landscape = exportLayout.orientation === "landscape";
    let width = isLetter ? 12240 : 11906;
    let height = isLetter ? 15840 : 16838;
    if (landscape) [width, height] = [height, width];
    const verticalMarginTwips = exportLayout.margins === "narrow" ? 720 : 1440;
    const horizontalMarginTwips = exportLayout.margins === "narrow" ? 720 : exportLayout.margins === "wide" ? 2880 : 1440;
    const hasHeader = Boolean(exportLayout.header);
    const hasFooter = Boolean(exportLayout.footer || exportLayout.pageNumbers);
    const headerRelationshipId = hasHeader ? `rId${nextRelationship++}` : "";
    const footerRelationshipId = hasFooter ? `rId${nextRelationship++}` : "";
    const headerReference = hasHeader ? `<w:headerReference w:type="default" r:id="${headerRelationshipId}"/>` : "";
    const footerReference = hasFooter ? `<w:footerReference w:type="default" r:id="${footerRelationshipId}"/>` : "";
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join("")}<w:sectPr>${headerReference}${footerReference}<w:pgSz w:w="${width}" w:h="${height}"/><w:pgMar w:top="${verticalMarginTwips}" w:right="${horizontalMarginTwips}" w:bottom="${verticalMarginTwips}" w:left="${horizontalMarginTwips}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style></w:styles>';
    const numberingXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="multilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="multilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>';
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>${hasHeader ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ""}${hasFooter ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : ""}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
    const rootRelationships = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
    if (hasHeader) relationships.push(`<Relationship Id="${headerRelationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>`);
    if (hasFooter) relationships.push(`<Relationship Id="${footerRelationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`);
    const documentRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${relationships.join("")}</Relationships>`;
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const coreProperties = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${wordXmlText(title())}</dc:title><dc:creator>adigunFreeDocEditor</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
    const appProperties = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>adigunFreeDocEditor</Application></Properties>';
    const files = { "[Content_Types].xml": contentTypes, "_rels/.rels": rootRelationships, "word/document.xml": documentXml, "word/styles.xml": stylesXml, "word/numbering.xml": numberingXml, "word/_rels/document.xml.rels": documentRelationships, "docProps/core.xml": coreProperties, "docProps/app.xml": appProperties };
    if (hasHeader) files["word/header1.xml"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">${wordXmlText(exportLayout.header)}</w:t></w:r></w:p></w:hdr>`;
    if (hasFooter) files["word/footer1.xml"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${exportLayout.footer ? `<w:r><w:t xml:space="preserve">${wordXmlText(exportLayout.footer)}${exportLayout.pageNumbers ? " · " : ""}</w:t></w:r>` : ""}${exportLayout.pageNumbers ? '<w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple>' : ""}</w:p></w:ftr>`;
    for (const image of images) files[`word/media/${image.fileName}`] = image.bytes;
    return { files, unsupported: [...unsupported] };
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
      const filename = encoder.encode(name); const data = value instanceof Uint8Array ? value : encoder.encode(value); const crc = crc32(data);
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

  async function exportDocx() {
    if (activePdfFile) { notify("Open an editable document before exporting a Word file."); return; }
    const source = document.createElement("div");
    source.innerHTML = documentModel.toHTML(documentModel.fromDOM(editor));
    try {
      for (const image of source.querySelectorAll("img")) if (typeof image.decode === "function") await image.decode();
    } catch { notify("Wait for the document images to finish loading, then export again."); return; }
    const wordPackage = makeWordPackage(source);
    if (wordPackage.unsupported.length && !window.confirm(`This export cannot preserve: ${wordPackage.unsupported.join(", ")}. It will create a reduced Word copy and leave the browser-saved document unchanged. Continue?`)) return;
    download(makeStoredZip(wordPackage.files), `${safeFilename(title())}.docx`);
    notify(wordPackage.unsupported.length ? `Word file saved. Check unsupported content: ${wordPackage.unsupported.join(", ")}.` : "Word document downloaded with supported tables, images and page setup.");
  }

  function exportHTML() {
    if (activePdfFile) { download(activePdfFile, activePdfFile.name); return; }
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHTML(title())}</title></head><body>${documentModel.toHTML(documentModel.fromDOM(editor))}</body></html>`;
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

  async function insertLocalImage(file) {
    imageInsertionRange = imageInsertionRange && editor.contains(imageInsertionRange.startContainer) ? imageInsertionRange : null;
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { notify("Choose a PNG, JPEG or GIF smaller than 8 MB."); return; }
    try {
      const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      const signatures = [
        ["image/png", [137, 80, 78, 71, 13, 10, 26, 10]],
        ["image/jpeg", [255, 216, 255]],
        ["image/gif", [71, 73, 70, 56, 55, 97]],
        ["image/gif", [71, 73, 70, 56, 57, 97]],
      ];
      const type = signatures.find(([mime, bytes]) => mime === file.type && bytes.every((value, index) => header[index] === value))?.[0];
      if (!type) { notify("This image is not a valid PNG, JPEG or GIF file."); return; }
      const src = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("The image could not be read."));
        reader.readAsDataURL(file);
      });
      const image = document.createElement("img");
      image.src = src;
      image.alt = file.name.slice(0, 300);
      image.style.maxWidth = "100%";
      const paragraph = document.createElement("p");
      paragraph.append(image);
      const anchor = imageInsertionRange?.startContainer;
      const anchorElement = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
      const block = anchorElement?.closest("p,h1,h2,h3,blockquote,pre,li,table");
      if (block && editor.contains(block)) block.after(paragraph);
      else editor.append(paragraph);
      const tail = document.createElement("p");
      tail.innerHTML = "<br>";
      paragraph.after(tail);
      editor.focus();
      const selection = window.getSelection();
      selection?.removeAllRanges();
      const caret = document.createRange();
      caret.setStart(tail, 0);
      caret.collapse(true);
      selection?.addRange(caret);
      countWords();
      saveDocument();
      notify("Inserted “" + file.name + "” from this device.");
    } catch (error) {
      notify(error.message || "The image could not be inserted.");
    } finally {
      imageInsertionRange = undefined;
    }
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
  $("#open-document").addEventListener("click", () => { setMobileMenu(false); openFilePicker(); });
  $("#mobile-menu").addEventListener("click", () => setMobileMenu(!$("#workspace-nav").classList.contains("mobile-open")));
  filePicker.addEventListener("change", () => { const file = filePicker.files[0]; filePicker.accept = acceptedFileTypes; filePicker.value = ""; if (file) importFile(file); });
  conversionFilePicker.addEventListener("change", () => { const file = conversionFilePicker.files[0]; conversionFilePicker.value = ""; if (file) selectConversionSource(file); });
  $("#conversion-select-source").addEventListener("click", () => conversionFilePicker.click());
  $("#conversion-target").addEventListener("change", clearConversionResult);
  $("#conversion-run").addEventListener("click", runConversion);
  $("#conversion-download").addEventListener("click", () => { if (conversionOutputBlob) { download(conversionOutputBlob, conversionOutputName); notify("Converted file downloaded."); } });
  filePicker.addEventListener("cancel", () => { filePicker.accept = acceptedFileTypes; });
  imagePicker.addEventListener("change", () => { insertLocalImage(imagePicker.files[0]); imagePicker.value = ""; });
  titleInput.addEventListener("input", () => { $("#stage-title").textContent = title(); saveDocument(); });
  window.addEventListener("resize", applyPaperCanvasMinimumHeight);
  if (window.ResizeObserver) new ResizeObserver(applyPaperCanvasMinimumHeight).observe(editor);
  editor.addEventListener("beforeinput", handleTrackedBeforeInput);
  editor.addEventListener("input", () => { countWords(); clearTimeout(reviewHighlightTimer); reviewHighlightTimer = setTimeout(() => { updateReviewHighlights(); renderTrackedChanges(); }, 350); saveDocument(); if (!replacingAllMatches && $("#find-dialog").open) refreshFindMatches(false); });
  $("#outline-search").addEventListener("input", renderOutline);
  $("#toggle-outline").addEventListener("click", () => {
    const panel = $("#document-outline");
    const open = panel.classList.toggle("mobile-open");
    if (open) showReviewPanel(false);
    $("#toggle-outline").setAttribute("aria-expanded", String(open));
  });
  $("#break-navigation-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-page-index]");
    if (!button || editor.contentEditable !== "true") return;
    const sheet = editor.querySelectorAll(".document-sheet")[Number(button.dataset.pageIndex)];
    if (!sheet) return;
    const target = sheet.firstElementChild || sheet;
    editor.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    sheet.scrollIntoView({ block: "center", behavior: "auto" });
  });
  $("#outline-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-outline-index]");
    if (!button) return;
    const heading = editor.querySelectorAll("h1, h2, h3")[Number(button.dataset.outlineIndex)];
    if (!heading) return;
    editor.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(heading);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    heading.scrollIntoView({ block: "nearest", behavior: "auto" });
  });
  $("#export-html").addEventListener("click", exportHTML);
  $("#export-docx").addEventListener("click", exportDocx);
  $("#save-document").addEventListener("click", () => { saveDocument(true); notify("Saved in this browser."); });
  $("#undo").addEventListener("click", () => runCommand("undo"));
  $("#redo").addEventListener("click", () => runCommand("redo"));
  $("#zoom-out").addEventListener("click", () => setZoom(zoom - 10));
  $("#zoom-in").addEventListener("click", () => setZoom(zoom + 10));
  $("#zoom-fit").addEventListener("click", fitToWidth);
  $("#paragraph-indent-ruler").addEventListener("input", (event) => setParagraphIndent(event.currentTarget.value));
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
    if (button.dataset.view === "templates") {
      $("#template-dialog").showModal();
    }
    else if (button.dataset.view === "settings") {
      $("#autosave-toggle").checked = autosave;
      $("#theme-toggle").checked = theme === "dark";
      $("#default-paper").value = defaultPageLayout.paper;
      $("#default-orientation").value = defaultPageLayout.orientation;
      $("#default-margins").value = defaultPageLayout.margins;
      $("#settings-dialog").showModal();
    }
    else if (button.dataset.view === "convert") showConversionWorkspace();
    else showDocumentList(button.dataset.view);
  });
  editor.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-open-id]"); if (openButton) openSaved(openButton.dataset.openId);
    if (event.target.closest("#empty-create")) createDocument();
    if (event.target.closest("#landing-create")) createDocument();
    const templateButton = event.target.closest("[data-template]");
    if (templateButton && documentTemplates[templateButton.dataset.template]) createDocument(documentTemplates[templateButton.dataset.template]);
    if (event.target.closest("#landing-open-word")) openFilePicker(".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    if (event.target.closest("#landing-open-pdf")) openFilePicker(".pdf,application/pdf");
    if (event.target.closest("#landing-open-file")) openFilePicker();
    if (event.target.closest("#landing-all")) document.querySelector('[data-view="recent"]')?.click();
    const trashButton = event.target.closest("[data-trash-id]"); if (trashButton) markDeleted(trashButton.dataset.trashId, true);
    const restoreButton = event.target.closest("[data-restore-id]"); if (restoreButton) markDeleted(restoreButton.dataset.restoreId, false);
  });
  $("#close-templates").addEventListener("click", () => $("#template-dialog").close());
  $("#template-dialog").addEventListener("click", (event) => {
    const button = event.target.closest("[data-template]");
    if (!button || !documentTemplates[button.dataset.template]) return;
    $("#template-dialog").close();
    createDocument(documentTemplates[button.dataset.template]);
  });
  $("#build-overview").addEventListener("click", buildOverview);
  $("#table-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const rows = Number($("#table-rows").value);
    const columns = Number($("#table-columns").value);
    if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || rows > 50 || columns < 1 || columns > 20) { notify("Enter between 1–50 rows and 1–20 columns."); return; }
    const table = document.createElement("table");
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (let column = 0; column < columns; column++) { const cell = document.createElement("th"); cell.innerHTML = "<p><br></p>"; headerRow.append(cell); }
    head.append(headerRow);
    table.append(head);
    const body = document.createElement("tbody");
    for (let row = 1; row < rows; row++) {
      const record = document.createElement("tr");
      for (let column = 0; column < columns; column++) { const cell = document.createElement("td"); cell.innerHTML = "<p><br></p>"; record.append(cell); }
      body.append(record);
    }
    table.append(body);
    const selection = window.getSelection();
    const anchor = tableInsertionRange?.startContainer;
    const anchorElement = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
    const block = anchorElement?.closest("p,h1,h2,h3,blockquote,pre,li,table");
    if (block && editor.contains(block)) block.after(table);
    else editor.append(table);
    const trailingParagraph = document.createElement("p");
    trailingParagraph.innerHTML = "<br>";
    table.after(trailingParagraph);
    editor.focus();
    selection?.removeAllRanges();
    const caret = document.createRange();
    caret.setStart(trailingParagraph, 0);
    caret.collapse(true);
    selection?.addRange(caret);
    countWords();
    saveDocument();
    tableInsertionRange = undefined;
    tableInsertionRange = undefined;
    $("#table-dialog").close();
    notify("Inserted a " + rows + " × " + columns + " table. Type in a cell to fill it.");
  });
  $("#cancel-table").addEventListener("click", () => $("#table-dialog").close());
  $("#apply-page-header-footer").addEventListener("click", () => setPageHeaderFooter($("#page-header-text").value, $("#page-footer-text").value));
  $("#autosave-toggle").addEventListener("change", (event) => { autosave = event.target.checked; localStorage.setItem("adigun-autosave", String(autosave)); if (autosave) saveDocument(); else setSaveStatus("Autosave off"); });
  $("#theme-toggle").addEventListener("change", (event) => setTheme(event.target.checked ? "dark" : "light"));
  function saveDefaultPageLayout() {
    defaultPageLayout.paper = $("#default-paper").value === "letter" ? "letter" : "a4";
    defaultPageLayout.orientation = $("#default-orientation").value === "landscape" ? "landscape" : "portrait";
    defaultPageLayout.margins = ["narrow", "wide"].includes($("#default-margins").value) ? $("#default-margins").value : "normal";
    localStorage.setItem("adigun-page-defaults", JSON.stringify(defaultPageLayout));
    notify("New document defaults saved.");
  }
  $("#default-paper").addEventListener("change", saveDefaultPageLayout);
  $("#default-orientation").addEventListener("change", saveDefaultPageLayout);
  $("#default-margins").addEventListener("change", saveDefaultPageLayout);
  $("#find-form").addEventListener("submit", (event) => { event.preventDefault(); navigateFindMatch(1); });
  $("#find-query").addEventListener("input", () => { refreshFindMatches(true); if (findMatches.length) showFindMatch(0); });
  $("#find-match-case").addEventListener("change", () => { refreshFindMatches(true); if (findMatches.length) showFindMatch(0); });
  $("#find-next").addEventListener("click", () => navigateFindMatch(1));
  $("#find-previous").addEventListener("click", () => navigateFindMatch(-1));
  $("#replace-current").addEventListener("click", () => {
    if (currentFindIndex < 0) return;
    const index = currentFindIndex;
    if (!replaceFindMatch(findMatches[index], $("#replace-query").value)) { notify("The selected match could not be replaced."); return; }
    refreshFindMatches(false);
    if (findMatches.length) showFindMatch(Math.min(index, findMatches.length - 1));
    $("#find-query").focus();
  });
  $("#replace-all").addEventListener("click", () => {
    if (!findMatches.length || findMatchTotal > FIND_MATCH_LIMIT) return;
    const matches = [...findMatches];
    const replacement = $("#replace-query").value;
    const dialog = $("#find-dialog");
    dialog.close();
    let replaced = 0;
    replacingAllMatches = true;
    try {
      for (let index = matches.length - 1; index >= 0; index--) if (replaceFindMatch(matches[index], replacement, false)) replaced++;
    } finally {
      replacingAllMatches = false;
      dialog.showModal();
    }
    refreshFindMatches(true);
    if (findMatches.length) showFindMatch(0);
    notify(`Replaced ${replaced} match${replaced === 1 ? "" : "es"}.`);
  });
  $("#close-find").addEventListener("click", () => $("#find-dialog").close());
  $("#find-dialog").addEventListener("close", clearFindHighlights);
  $("#comment-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const body = $("#comment-text").value.trim();
    if (!body) { notify("Write a comment before posting."); return; }
    if (!pendingReviewAnchor) { notify("Select text in the document before adding a comment."); $("#comment-dialog").close(); return; }
    if (reviewComments.length >= 500) { notify("This document has reached the 500 comment limit."); return; }
    reviewComments.push({ id: crypto.randomUUID(), ...pendingReviewAnchor, body: body.slice(0, 2000), author: "You", createdAt: Date.now(), resolved: false });
    pendingReviewAnchor = null;
    $("#comment-dialog").close();
    renderReviewComments();
    showReviewPanel(true);
    saveDocument();
    notify("Comment added and saved with this document.");
  });
  const closeCommentDialog = () => { pendingReviewAnchor = null; $("#comment-dialog").close(); };
  $("#cancel-comment").addEventListener("click", closeCommentDialog);
  $("#close-comment").addEventListener("click", closeCommentDialog);
  $("#comment-dialog").addEventListener("close", () => { pendingReviewAnchor = null; });
  $("#close-review-comments").addEventListener("click", () => showReviewPanel(false));
  $("#review-filter-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-review-filter]");
    if (!button) return;
    reviewFilter = button.dataset.reviewFilter;
    for (const item of $("#review-filter-list").querySelectorAll("[data-review-filter]")) item.setAttribute("aria-pressed", String(item === button));
    renderReviewComments();
  });
  $("#review-search").addEventListener("input", (event) => { reviewSearch = event.target.value; renderReviewComments(); });
  $("#tracked-revision-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-revision-action]");
    if (button && ["accept", "reject"].includes(button.dataset.revisionAction)) resolveTrackedRevision(button.dataset.revisionId, button.dataset.revisionAction);
  });
  $("#tracked-revision-actions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-revision-action]");
    if (!button) return;
    if (button.dataset.revisionAction === "accept-all") resolveAllTrackedRevisions(true);
    if (button.dataset.revisionAction === "reject-all") resolveAllTrackedRevisions(false);
  });
  $("#review-comment-list").addEventListener("click", (event) => {
    const go = event.target.closest("[data-comment-go]");
    if (go) { goToReviewComment(go.dataset.commentGo); return; }
    const resolve = event.target.closest("[data-comment-resolve]");
    if (!resolve) return;
    const comment = reviewComments.find((item) => item.id === resolve.dataset.commentResolve);
    if (!comment) return;
    comment.resolved = !comment.resolved;
    renderReviewComments();
    saveDocument();
    notify(comment.resolved ? "Comment resolved." : "Comment reopened.");
  });
  document.addEventListener("keydown", (event) => {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "s") { event.preventDefault(); saveDocument(true); notify("Saved in this browser."); }
  });
  const documentStage = $("#document-stage");
  let fileDragDepth = 0;
  function isFileDrag(event) {
    return Array.from(event.dataTransfer?.types || []).includes("Files");
  }
  documentStage.addEventListener("dragenter", (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    fileDragDepth++;
    $("#editor-card").classList.add("drop-active");
  });
  documentStage.addEventListener("dragover", (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });
  documentStage.addEventListener("dragleave", (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    fileDragDepth = Math.max(0, fileDragDepth - 1);
    if (!fileDragDepth) $("#editor-card").classList.remove("drop-active");
  });
  documentStage.addEventListener("drop", (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    fileDragDepth = 0;
    $("#editor-card").classList.remove("drop-active");
    importFile(event.dataTransfer.files[0]);
  });

  document.addEventListener("selectionchange", updateRibbonSelection);
  for (const event of ["click", "keyup", "mouseup", "input", "focus"]) editor.addEventListener(event, updateRibbonSelection);
  window.addEventListener("resize", scheduleEditorPagination, { passive: true });
  renderRibbon(); setupAssistantDrag(); countWords();
  if (window.matchMedia("(max-width: 700px)").matches) toggleAssistant(false);
  openDatabase().then(() => { setSaveStatus("Saved"); showLanding(); }).catch(() => { setSaveStatus("Local save unavailable"); notify("Local saving is unavailable in this browser."); showLanding(); });
})();

