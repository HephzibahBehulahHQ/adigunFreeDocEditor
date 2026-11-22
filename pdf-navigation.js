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
  const reader = $("pdf-reader");
  const scroll = $("pdf-reader-scroll");
  const zoom = $("pdf-reader-zoom");
  const hand = $("pdf-reader-hand");
  const layout = $("pdf-reader-layout");
  const browserPreview = $("pdf-preview");
  let session;
  let generation = 0;
  const jobs = new Map();
  let continuousObserver;
  let scrollFrame;
  let drag;

  hand.addEventListener("click", () => {
    const enabled = scroll.classList.toggle("pdf-reader-hand");
    hand.setAttribute("aria-pressed", String(enabled));
  });
  scroll.addEventListener("pointerdown", (event) => {
    if (!scroll.classList.contains("pdf-reader-hand") || !event.isPrimary || event.button !== 0) return;
    if (scroll.scrollHeight <= scroll.clientHeight && scroll.scrollWidth <= scroll.clientWidth) return;
    const box = scroll.getBoundingClientRect();
    if (event.clientX >= box.left + scroll.clientLeft + scroll.clientWidth ||
        event.clientY >= box.top + scroll.clientTop + scroll.clientHeight) return;
    event.preventDefault();
    scroll.focus({ preventScroll: true });
    scroll.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: scroll.scrollLeft, top: scroll.scrollTop };
    scroll.classList.add("pdf-reader-dragging");
  });
  scroll.addEventListener("pointermove", (event) => {
    if (drag?.id !== event.pointerId) return;
    scroll.scrollTo(drag.left + drag.x - event.clientX, drag.top + drag.y - event.clientY);
  });
  scroll.addEventListener("lostpointercapture", (event) => {
    if (drag?.id !== event.pointerId) return;
    drag = undefined;
    scroll.classList.remove("pdf-reader-dragging");
  });

  function cancelPageRender(surface) {
    const job = jobs.get(surface);
    jobs.delete(surface);
    job?.canvasTask?.cancel();
    job?.textTask?.cancel();
  }

  function clearPages() {
    continuousObserver?.disconnect();
    continuousObserver = undefined;
    cancelAnimationFrame(scrollFrame);
    scrollFrame = undefined;
    for (const surface of jobs.keys()) cancelPageRender(surface);
    scroll.replaceChildren();
  }

  function stop() {
    generation++;
    clearPages();
    if (!session) return;
    session.observer?.disconnect();
    void session.task.destroy().catch(() => {});
    session = undefined;
  }

  function pageScale(width, height) {
    const widthScale = Math.max(0.15, (scroll.clientWidth - 28) / width);
    const heightScale = Math.max(0.15, (scroll.clientHeight - 28) / height);
    return zoom.value === "fit" ? Math.min(widthScale, heightScale) :
      zoom.value === "width" ? widthScale : Number(zoom.value);
  }

  function setSurfaceSize(surface, width, height) {
    surface.style.width = width + "px";
    surface.style.height = height + "px";
  }

  async function drawPage(view, index, pageSurface) {
    const job = {};
    jobs.set(pageSurface, job);
    const active = () => jobs.get(pageSurface) === job;
    try {
      const page = await view.document.getPage(index + 1);
      if (!active()) return;
      const rotation = (page.rotate + (view.rotation ?? 0)) % 360;
      const original = page.getViewport({ scale: 1, rotation });
      view.pageSizes.set(index, { width: original.width, height: original.height });
      const scale = pageScale(original.width, original.height);
      const viewport = page.getViewport({ scale, rotation });
      setSurfaceSize(pageSurface, viewport.width, viewport.height);
      pageSurface.style.setProperty("--scale-factor", viewport.scale);
      const canvas = document.createElement("canvas");
      const density = Math.min(window.devicePixelRatio || 1, 3000 / Math.max(viewport.width, viewport.height));
      canvas.width = Math.max(1, Math.floor(viewport.width * density));
      canvas.height = Math.max(1, Math.floor(viewport.height * density));
      canvas.setAttribute("aria-hidden", "true");
      const textLayer = document.createElement("div");
      textLayer.className = "pdf-reader-text";
      job.canvasTask = page.render({ canvasContext: canvas.getContext("2d"), viewport, transform: [density, 0, 0, density, 0, 0], background: "white" });
      await job.canvasTask.promise;
      if (!active()) return;
      pageSurface.replaceChildren(canvas, textLayer);
      job.textTask = window.pdfjsLib.renderTextLayer({ textContentSource: page.streamTextContent(), container: textLayer, viewport });
      await job.textTask.promise;
    } catch (error) {
      if (active()) status.textContent = error.message || "The page could not be displayed.";
    }
  }

  function updatePageIndex(index) {
    thumbnails.children[session.index]?.firstElementChild.removeAttribute("aria-current");
    thumbnails.children[index]?.firstElementChild.setAttribute("aria-current", "page");
    go.elements.page.value = index + 1;
    session.index = index;
    $("pdf-reader-page").textContent = `${index + 1} of ${session.document.numPages}`;
    $("pdf-reader-prev").disabled = index === 0;
    $("pdf-reader-next").disabled = index + 1 >= session.document.numPages;
  }

  function buildReader(view) {
    clearPages();
    const continuous = layout.value === "continuous";
    scroll.classList.toggle("pdf-reader-continuous", continuous);
    if (!continuous) {
      const surface = document.createElement("div");
      surface.className = "pdf-reader-page";
      scroll.append(surface);
      scroll.scrollTo(0, 0);
      void drawPage(view, view.index, surface);
      return;
    }
    const fallback = view.pageSizes.get(view.index) ?? (view.rotation % 180 ? { width: 792, height: 612 } : { width: 612, height: 792 });
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < view.document.numPages; index++) {
      const surface = document.createElement("div");
      surface.className = "pdf-reader-page";
      surface.dataset.index = index;
      surface.setAttribute("role", "group");
      surface.setAttribute("aria-label", `Page ${index + 1}`);
      const { width, height } = view.pageSizes.get(index) ?? fallback;
      const scale = pageScale(width, height);
      setSurfaceSize(surface, width * scale, height * scale);
      fragment.append(surface);
    }
    scroll.append(fragment);
    const observer = new IntersectionObserver((entries) => {
      if (observer !== continuousObserver || session !== view) return;
      for (const { target, isIntersecting } of entries) {
        if (isIntersecting && !jobs.has(target)) void drawPage(view, Number(target.dataset.index), target);
        if (!isIntersecting && jobs.has(target)) {
          cancelPageRender(target);
          target.replaceChildren();
        }
      }
    }, { root: scroll, rootMargin: "75% 0px" });
    continuousObserver = observer;
    for (const surface of scroll.children) observer.observe(surface);
    goToSurface(view.index);
  }

  function goToSurface(index) {
    const surface = scroll.children[index];
    if (!surface) return;
    const inset = Math.max(14, (scroll.clientHeight - surface.offsetHeight) / 2);
    scroll.scrollTo(0, surface.offsetTop - inset);
  }

  scroll.addEventListener("scroll", () => {
    if (!continuousObserver || scrollFrame !== undefined) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = undefined;
      if (!continuousObserver || !session?.document || !scroll.children.length) return;
      const center = scroll.scrollTop + scroll.clientHeight / 2;
      let first = 0;
      let last = scroll.children.length - 1;
      while (first < last) {
        const middle = Math.floor((first + last) / 2);
        const page = scroll.children[middle];
        if (page.offsetTop + page.offsetHeight < center) first = middle + 1;
        else last = middle;
      }
      if (first !== session.index) updatePageIndex(first);
    });
  }, { passive: true });

  function showPage(index) {
    if (!session?.document || index < 0 || index >= session.document.numPages) return;
    updatePageIndex(index);
    preview(session.item.file, index + 1);
    browserPreview.hidden = true;
    reader.hidden = false;
    if (continuousObserver) goToSurface(index);
    else buildReader(session);
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
      const view = { item, task: openPdfRaster(bytes), rotation: 0, pageSizes: new Map() };
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
    if (!reader.hidden) {
      if (continuousObserver && session?.document) preview(session.item.file, session.index + 1);
      browserPreview.hidden = !browserPreview.hasAttribute("src");
    }
    reader.hidden = true;
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
  $("pdf-reader-prev").addEventListener("click", () => { if (session?.document) showPage(session.index - 1); });
  $("pdf-reader-next").addEventListener("click", () => { if (session?.document) showPage(session.index + 1); });
  $("pdf-reader-rotate").addEventListener("click", () => {
    if (!session?.document) return;
    session.rotation = (session.rotation + 90) % 360;
    session.pageSizes.clear();
    buildReader(session);
  });
  for (const control of [zoom, layout]) {
    control.addEventListener("change", () => { if (session?.document) buildReader(session); });
  }
  new ResizeObserver(() => {
    if (!reader.hidden && session?.document && ["fit", "width"].includes(zoom.value)) buildReader(session);
  }).observe(scroll);
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
