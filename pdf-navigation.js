import { openPdfRaster, renderPdfPage } from "./pdf-render.js";

export function bindPdfNavigation(sources, preview) {
  const $ = (id) => document.getElementById(id);
  const panel = $("pdf-navigation");
  const source = $("pdf-navigation-source");
  const thumbnails = $("pdf-thumbnails");
  const bookmarks = $("pdf-bookmarks");
  const results = $("pdf-search-results");
  const status = $("pdf-navigation-status");
  const go = $("pdf-jump");
  const search = $("pdf-search");
  const toggle = $("pdf-navigation-toggle");
  let session;
  let generation = 0;

  function stop() {
    generation++;
    if (!session) return;
    session.observer?.disconnect();
    void session.task.destroy().catch(() => {});
    session = undefined;
  }

  function showPage(index) {
    if (!session?.document || index < 0 || index >= session.document.numPages) return;
    for (const button of thumbnails.querySelectorAll("[aria-current]")) button.removeAttribute("aria-current");
    thumbnails.children[index]?.firstElementChild.setAttribute("aria-current", "page");
    go.elements.page.value = index + 1;
    preview(session.item.file, index + 1);
  }

  function pageLink(text, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-outline";
    button.textContent = text;
    button.addEventListener("click", () => showPage(index));
    return button;
  }

  async function listBookmarks(view) {
    const outline = await view.document.getOutline();
    if (!outline || session !== view) return;
    const pending = [...outline].reverse();
    for (let count = 0; count < 200 && pending.length && session === view; count++) {
      const item = pending.pop();
      pending.push(...item.items.slice(0, 200).reverse());
      const dest = typeof item.dest === "string" ? await view.document.getDestination(item.dest) : item.dest;
      if (!dest?.length) continue;
      try {
        const index = Number.isInteger(dest[0]) ? dest[0] : await view.document.getPageIndex(dest[0]);
        if (session !== view || index < 0 || index >= view.document.numPages) continue;
        const row = document.createElement("li");
        row.append(pageLink(item.title || `Page ${index + 1}`, index));
        bookmarks.append(row);
      } catch { /* Skip a bookmark with an invalid page target. */ }
    }
    $("pdf-bookmark-section").hidden = !bookmarks.children.length;
  }

  async function load() {
    stop();
    const request = generation;
    thumbnails.replaceChildren();
    bookmarks.replaceChildren();
    results.replaceChildren();
    $("pdf-bookmark-section").hidden = true;
    go.querySelector("button").disabled = true;
    search.querySelector("button").disabled = true;
    const item = sources[source.value];
    if (!item) { status.textContent = "Open a PDF to navigate its pages."; return; }
    status.textContent = "Opening page navigation…";
    try {
      const bytes = new Uint8Array(await item.file.arrayBuffer());
      if (request !== generation || panel.hidden || sources[source.value] !== item) return;
      const view = { item, task: openPdfRaster(bytes) };
      session = view;
      view.document = await view.task.promise;
      if (session !== view) return;
      go.elements.page.max = view.document.numPages;
      go.querySelector("button").disabled = false;
      search.querySelector("button").disabled = false;
      const list = document.createDocumentFragment();
      for (let index = 0; index < view.document.numPages; index++) {
        const row = document.createElement("li");
        row.dataset.index = index;
        const button = pageLink(`Page ${index + 1}`, index);
        const canvas = document.createElement("canvas");
        canvas.width = 75;
        canvas.height = 96;
        canvas.setAttribute("aria-hidden", "true");
        button.prepend(canvas);
        row.append(button);
        list.append(row);
      }
      thumbnails.append(list);
      view.observer = new IntersectionObserver((entries) => {
        for (const { target, isIntersecting } of entries) {
          if (session !== view || !isIntersecting) continue;
          view.observer.unobserve(target);
          void renderPdfPage(view.document, Number(target.dataset.index), target.querySelector("canvas"), 0, 155)
            .catch(() => { target.querySelector("canvas").hidden = true; });
        }
      }, { root: thumbnails });
      for (const row of thumbnails.children) view.observer.observe(row);
      showPage(0);
      status.textContent = `${view.document.numPages} ${view.document.numPages === 1 ? "page" : "pages"}`;
      void listBookmarks(view).catch(() => {});
    } catch (error) {
      if (request === generation && !panel.hidden) status.textContent = error.message || "Page navigation could not open this PDF.";
    }
  }

  function close() {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    stop();
  }
  toggle.addEventListener("click", () => {
    if (!panel.hidden) { close(); return; }
    source.replaceChildren(...sources.map((item, index) => new Option(item.file.name, index)));
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    void load();
    source.focus();
  });
  $("pdf-navigation-close").addEventListener("click", () => { close(); toggle.focus(); });
  source.addEventListener("change", () => void load());
  go.addEventListener("submit", (event) => {
    event.preventDefault();
    showPage(go.elements.page.valueAsNumber - 1);
  });
  search.addEventListener("submit", async (event) => {
    event.preventDefault();
    const view = session;
    const query = search.elements.query.value.trim().toLowerCase();
    if (!view?.document || !query) return;
    const run = search.querySelector("button");
    run.disabled = true;
    results.replaceChildren();
    try {
      let matches = 0;
      for (let index = 0; index < view.document.numPages; index++) {
        if (session !== view) return;
        status.textContent = `Searching page ${index + 1} of ${view.document.numPages}…`;
        const page = await view.document.getPage(index + 1);
        const data = await page.getTextContent();
        if (session !== view) return;
        const text = data.items.map((item) => item.str ?? "").join(" ").replace(/\s+/g, " ");
        const start = text.toLowerCase().indexOf(query);
        if (start < 0) continue;
        const row = document.createElement("li");
        const excerpt = text.slice(Math.max(0, start - 24), start + query.length + 36);
        row.append(pageLink(`Page ${index + 1} · ${excerpt}`, index));
        results.append(row);
        matches++;
      }
      status.textContent = matches ? `Text found on ${matches} ${matches === 1 ? "page" : "pages"}.` : "No matches in the PDF text layer.";
    } catch (error) {
      if (session === view) status.textContent = error.message || "PDF text search failed.";
    } finally { if (session === view) run.disabled = false; }
  });
  return close;
}
