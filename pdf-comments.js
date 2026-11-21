import { openPdfRaster, renderPdfPage } from "./pdf-render.js";

const markTypes = {
  note: { label: "Sticky note", subtype: "Text", color: [1, 0.77, 0.22] },
  highlight: { label: "Highlight", subtype: "Highlight", color: [1, 0.84, 0.16] },
  underline: { label: "Underline", subtype: "Underline", color: [0.2, 0.43, 0.7] },
  strike: { label: "Strikeout", subtype: "StrikeOut", color: [0.76, 0.19, 0.25] },
  box: { label: "Rectangle", subtype: "Square", color: [0.29, 0.2, 0.65] },
};

export function addPdfComments(pdf, entries, { PDFName, PDFHexString }) {
  for (const entry of entries) {
    const page = pdf.getPage(entry.pageIndex);
    const type = markTypes[entry.kind];
    const properties = {
      Type: "Annot", Subtype: type.subtype, P: page.ref, C: type.color, F: 4,
    };
    if (entry.text) properties.Contents = PDFHexString.fromText(entry.text);
    if (entry.kind === "note") {
      const [x, y] = entry.point;
      properties.Rect = [x - 8, y - 8, x + 8, y + 8];
      properties.Name = PDFName.of("Comment");
    } else {
      const xs = entry.quad.map(([x]) => x);
      const ys = entry.quad.map(([, y]) => y);
      const padding = entry.kind === "box" ? 2 : 1;
      properties.Rect = [Math.min(...xs) - padding, Math.min(...ys) - padding, Math.max(...xs) + padding, Math.max(...ys) + padding];
      if (entry.kind === "box") properties.BS = { W: 2, S: "S" };
      else properties.QuadPoints = entry.quad.flat();
    }
    const annotation = pdf.context.obj(properties);
    page.node.addAnnot(pdf.context.register(annotation));
  }
}

export function bindPdfComments(sources, preview) {
  const dialog = document.querySelector("#pdf-comments-dialog");
  const form = dialog.querySelector("form");
  const { source, page, kind, left, top, width, height, text } = form.elements;
  const canvas = dialog.querySelector("canvas");
  const list = dialog.querySelector("ol");
  const status = dialog.querySelector("[role=status]");
  const download = dialog.querySelector("[data-export]");
  const close = dialog.querySelector("[data-close]");
  const area = form.querySelector("[data-area]");
  const add = form.querySelector("[type=submit]");
  const allControls = [...form.querySelectorAll("input,select,textarea,button"), close, download];
  const entries = [];
  let task;
  let raster;
  let viewport;
  let busy = false;
  let draft = false;
  let anchor;
  const discard = () => !(draft || text.value.trim()) || window.confirm("Discard unsaved PDF comments?");

  function enableControls() {
    for (const control of [...allControls, ...list.querySelectorAll("textarea, button")]) control.disabled = busy;
    add.disabled = busy || !viewport;
    download.disabled = busy || !entries.length;
    updateKind();
  }

  function updateKind() {
    area.hidden = kind.value === "note";
    for (const field of [width, height]) field.disabled = busy || area.hidden;
    text.required = kind.value === "note";
  }

  function drawMarks() {
    const context = canvas.getContext("2d");
    for (const comment of entries.filter((entry) => entry.pageIndex === page.selectedIndex)) {
      const x = comment.left * canvas.width;
      const y = comment.top * canvas.height;
      const w = comment.width * canvas.width;
      const h = comment.height * canvas.height;
      const rgb = markTypes[comment.kind].color.map((value) => Math.round(value * 255)).join(",");
      context.fillStyle = `rgba(${rgb},0.36)`;
      context.strokeStyle = `rgb(${rgb})`;
      context.lineWidth = 3;
      if (comment.kind === "note") {
        context.beginPath();
        context.arc(x, y, 10, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      } else if (comment.kind === "highlight") context.fillRect(x, y, w, h);
      else if (comment.kind === "box") context.strokeRect(x, y, w, h);
      else {
        const line = comment.kind === "underline" ? y + h : y + h / 2;
        context.beginPath();
        context.moveTo(x, line);
        context.lineTo(x + w, line);
        context.stroke();
      }
    }
  }

  async function draw() {
    busy = true;
    viewport = undefined;
    canvas.hidden = true;
    enableControls();
    try {
      viewport = await renderPdfPage(raster, page.selectedIndex, canvas, 0, 1600);
      drawMarks();
      canvas.hidden = false;
      status.textContent = "Click to place a note or drag to set a markup area.";
    } catch (error) {
      status.textContent = error.message || "The page could not be rendered.";
    } finally { busy = false; enableControls(); }
  }

  function renderEntries() {
    list.replaceChildren(...entries.map((entry, index) => {
      const item = document.createElement("li");
      const label = document.createElement("label");
      const field = document.createElement("textarea");
      const remove = document.createElement("button");
      label.textContent = `${markTypes[entry.kind].label} ${index + 1} · Page ${entry.pageIndex + 1}`;
      field.rows = 2;
      field.maxLength = 1000;
      field.value = entry.text;
      field.addEventListener("input", () => { entry.text = field.value; draft = true; });
      label.append(field);
      remove.type = "button";
      remove.className = "button button-outline";
      remove.textContent = "Remove mark";
      remove.addEventListener("click", () => {
        if (busy) return;
        entries.splice(index, 1);
        draft = true;
        renderEntries();
        if (entry.pageIndex === page.selectedIndex) void draw();
      });
      item.append(label, remove);
      return item;
    }));
    enableControls();
  }

  async function load() {
    busy = true;
    viewport = undefined;
    canvas.hidden = true;
    entries.length = 0;
    text.value = "";
    draft = false;
    renderEntries();
    try {
      await task?.destroy();
      const pdf = sources[source.value].document;
      const lib = window.PDFLib;
      if (pdf.catalog.has(lib.PDFName.of("Perms")) || pdf.catalog.getAcroForm()?.dict.has(lib.PDFName.of("XFA")) ||
        pdf.getForm().getFields().some((field) => field instanceof lib.PDFSignature)) {
        throw new Error("Choose an unsigned PDF without XFA fields.");
      }
      task = openPdfRaster(new Uint8Array(await sources[source.value].file.arrayBuffer()));
      raster = await task.promise;
      page.replaceChildren(...Array.from({ length: raster.numPages }, (_, index) => new Option(index + 1)));
      await draw();
    } catch (error) {
      page.replaceChildren();
      status.textContent = error.message || "Could not open the PDF.";
    } finally { busy = false; enableControls(); }
  }

  document.querySelector("#pdf-comments-open").addEventListener("click", () => {
    source.replaceChildren(...sources.map((item, index) => new Option(item.file.name, index)));
    dialog.showModal();
    void load();
  });
  source.addEventListener("change", () => {
    if (discard()) void load();
    else source.value = source.dataset.selected ?? "0";
    source.dataset.selected = source.value;
  });
  page.addEventListener("change", () => void draw());
  kind.addEventListener("change", updateKind);
  close.addEventListener("click", () => { if (!busy && discard()) dialog.close(); });
  dialog.addEventListener("cancel", (event) => { if (busy || !discard()) event.preventDefault(); });
  dialog.addEventListener("close", () => {
    void task?.destroy().catch(() => {});
    task = raster = viewport = undefined;
    canvas.width = canvas.height = 0;
    source.dataset.selected = "0";
  });
  function coordinates(event) {
    const rect = canvas.getBoundingClientRect();
    const clamp = (value) => Math.min(100, Math.max(0, value * 100));
    return [clamp((event.clientX - rect.left) / rect.width), clamp((event.clientY - rect.top) / rect.height)];
  }
  canvas.addEventListener("click", (event) => {
    if (busy || kind.value !== "note") return;
    const [x, y] = coordinates(event);
    left.value = x.toFixed(1);
    top.value = y.toFixed(1);
    text.focus();
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (busy || kind.value === "note" || event.button !== 0 || !event.isPrimary) return;
    anchor = coordinates(event);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointercancel", () => { anchor = undefined; });
  canvas.addEventListener("pointerup", (event) => {
    if (!anchor || !event.isPrimary) return;
    const [firstX, firstY] = anchor;
    anchor = undefined;
    if (busy) return;
    const [x, y] = coordinates(event);
    left.value = Math.min(firstX, x).toFixed(1);
    top.value = Math.min(firstY, y).toFixed(1);
    width.value = Math.max(0.1, Math.abs(firstX - x)).toFixed(1);
    height.value = Math.max(0.1, Math.abs(firstY - y)).toFixed(1);
    add.focus();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy || !viewport || (kind.value === "note" && !text.value.trim())) return;
    const x = left.valueAsNumber / 100;
    const y = top.valueAsNumber / 100;
    const w = kind.value === "note" ? 0 : width.valueAsNumber / 100;
    const h = kind.value === "note" ? 0 : height.valueAsNumber / 100;
    if (x + w > 1.00001 || y + h > 1.00001) { status.textContent = "Keep the marked area inside the page."; return; }
    const pointAt = (a, b) => viewport.convertToPdfPoint(a * viewport.width, b * viewport.height);
    entries.push({
      kind: kind.value,
      pageIndex: page.selectedIndex,
      left: x, top: y, width: w, height: h,
      point: pointAt(x, y),
      quad: [pointAt(x, y), pointAt(x + w, y), pointAt(x, y + h), pointAt(x + w, y + h)],
      text: text.value.trim(),
    });
    text.value = "";
    draft = true;
    renderEntries();
    void draw();
  });
  download.addEventListener("click", async () => {
    if (busy || !entries.length) return;
    if (entries.some((entry) => entry.kind === "note" && !entry.text.trim())) { status.textContent = "Enter text for every sticky note or remove the empty notes."; return; }
    busy = true;
    enableControls();
    try {
      const item = sources[source.value];
      const lib = window.PDFLib;
      const output = await lib.PDFDocument.load(await item.file.arrayBuffer(), { updateMetadata: false });
      addPdfComments(output, entries, lib);
      const file = new File([await output.save({ updateFieldAppearances: false })], item.file.name.replace(/\.pdf$/i, "") + "-reviewed.pdf", { type: "application/pdf" });
      preview(file, page.selectedIndex + 1);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(file);
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      draft = false;
      status.textContent = "Reviewed PDF downloaded with annotations.";
    } catch (error) { status.textContent = error.message || "Could not export the reviewed PDF."; }
    finally { busy = false; enableControls(); }
  });
}
