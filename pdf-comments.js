import { openPdfRaster, renderPdfPage } from "./pdf-render.js";

export function addPdfComments(pdf, entries, { PDFName, PDFHexString }) {
  for (const { pageIndex, point: [x, y], text } of entries) {
    const page = pdf.getPage(pageIndex);
    const annotation = pdf.context.obj({
      Type: "Annot", Subtype: "Text", P: page.ref, Rect: [x - 8, y - 8, x + 8, y + 8],
      Name: PDFName.of("Comment"), C: [1, 0.77, 0.22], F: 4, Contents: PDFHexString.fromText(text),
    });
    page.node.addAnnot(pdf.context.register(annotation));
  }
}

export function bindPdfComments(sources, preview) {
  const dialog = document.querySelector("#pdf-comments-dialog");
  const form = dialog.querySelector("form");
  const { source, page, left, top, text } = form.elements;
  const canvas = dialog.querySelector("canvas");
  const list = dialog.querySelector("ol");
  const status = dialog.querySelector("[role=status]");
  const download = dialog.querySelector("[data-export]");
  const close = dialog.querySelector("[data-close]");
  const add = form.querySelector("[type=submit]");
  const allControls = [...form.querySelectorAll("input,select,textarea,button"), close, download];
  const entries = [];
  let task;
  let raster;
  let viewport;
  let busy = false;
  let draft = false;
  const discard = () => !(draft || text.value.trim()) || window.confirm("Discard unsaved PDF comments?");

  function enableControls() {
    for (const control of [...allControls, ...list.querySelectorAll("textarea, button")]) control.disabled = busy;
    add.disabled = busy || !viewport;
    download.disabled = busy || !entries.length;
  }

  function drawPins() {
    const context = canvas.getContext("2d");
    for (const comment of entries.filter((entry) => entry.pageIndex === page.selectedIndex)) {
      context.beginPath();
      context.fillStyle = "#f9c751";
      context.arc(comment.left * canvas.width, comment.top * canvas.height, 12, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "#382700";
      context.stroke();
    }
  }

  async function draw() {
    busy = true;
    viewport = undefined;
    canvas.hidden = true;
    enableControls();
    try {
      viewport = await renderPdfPage(raster, page.selectedIndex, canvas, 0, 1600);
      drawPins();
      canvas.hidden = false;
      status.textContent = "Click the page to position a note.";
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
      label.textContent = `Note ${index + 1} · Page ${entry.pageIndex + 1}`;
      field.rows = 2;
      field.maxLength = 1000;
      field.value = entry.text;
      field.addEventListener("input", () => { entry.text = field.value; draft = true; });
      label.append(field);
      remove.type = "button";
      remove.className = "button button-outline";
      remove.textContent = "Remove note";
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
  close.addEventListener("click", () => { if (!busy && discard()) dialog.close(); });
  dialog.addEventListener("cancel", (event) => { if (busy || !discard()) event.preventDefault(); });
  dialog.addEventListener("close", () => {
    void task?.destroy().catch(() => {});
    task = raster = viewport = undefined;
    canvas.width = canvas.height = 0;
    source.dataset.selected = "0";
  });
  canvas.addEventListener("click", (event) => {
    if (busy) return;
    const rect = canvas.getBoundingClientRect();
    left.value = (100 * (event.clientX - rect.left) / rect.width).toFixed(1);
    top.value = (100 * (event.clientY - rect.top) / rect.height).toFixed(1);
    text.focus();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy || !viewport || !text.value.trim()) return;
    const x = left.valueAsNumber / 100;
    const y = top.valueAsNumber / 100;
    entries.push({
      pageIndex: page.selectedIndex,
      left: x, top: y,
      point: viewport.convertToPdfPoint(x * viewport.width, y * viewport.height),
      text: text.value.trim(),
    });
    text.value = "";
    draft = true;
    drawPins();
    renderEntries();
    status.textContent = "Note added to the current page.";
  });
  download.addEventListener("click", async () => {
    if (busy || !entries.length) return;
    if (entries.some((entry) => !entry.text.trim())) { status.textContent = "Enter text for every note or remove the empty notes."; return; }
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
      status.textContent = "Reviewed PDF downloaded with sticky notes.";
    } catch (error) { status.textContent = error.message || "Could not export the reviewed PDF."; }
    finally { busy = false; enableControls(); }
  });
}
