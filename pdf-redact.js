import { openPdfRaster, renderPdfPage } from "./pdf-render.js";

function paintMarks(canvas, marks) {
  const context = canvas.getContext("2d");
  context.fillStyle = "#000";
  for (const [left, top, right, bottom] of marks) {
    const x = Math.floor(left * canvas.width);
    const y = Math.floor(top * canvas.height);
    context.fillRect(x, y, Math.ceil(right * canvas.width) - x, Math.ceil(bottom * canvas.height) - y);
  }
}

export function bindPdfRedaction(sources) {
  const dialog = document.querySelector("#pdf-redact-dialog");
  const { source, page, left, top, width, height } = dialog.querySelector("form").elements;
  const canvas = dialog.querySelector("canvas");
  const status = dialog.querySelector("[role=status]");
  const undo = dialog.querySelector("[data-undo]");
  const download = dialog.querySelector("[data-export]");
  const close = dialog.querySelector("[data-close]");
  const controls = [...dialog.querySelectorAll("button, input, select")];
  const marks = new Map();
  let raster;
  let pdf;
  let busy = false;
  let start;

  function setBusy(value) {
    busy = value;
    for (const control of controls) control.disabled = value;
    if (!value) {
      undo.disabled = !marks.get(page.selectedIndex)?.length;
      download.disabled = !marks.size;
    }
  }

  async function preview() {
    setBusy(true);
    canvas.hidden = true;
    try {
      await renderPdfPage(pdf, page.selectedIndex, canvas);
      const regions = marks.get(page.selectedIndex) || [];
      paintMarks(canvas, regions);
      canvas.hidden = false;
      status.textContent = `Page ${page.value} of ${pdf.numPages}. ${regions.length} marked areas on this page.`;
    } catch {
      status.textContent = "Could not render this page.";
    } finally { setBusy(false); }
  }

  async function loadSource() {
    setBusy(true);
    canvas.hidden = true;
    status.textContent = "Opening the PDF…";
    try {
      await raster?.destroy();
      pdf = undefined;
      const item = sources[source.value];
      raster = openPdfRaster(new Uint8Array(await item.file.arrayBuffer()));
      pdf = await raster.promise;
      if (pdf.numPages > 30) throw new Error("Redaction supports PDFs with up to 30 pages.");
      page.replaceChildren(...Array.from({ length: pdf.numPages }, (_, index) => new Option(index + 1)));
      await preview();
    } catch (error) {
      status.textContent = error.message || "Could not open the PDF.";
      page.replaceChildren();
    } finally { setBusy(false); }
  }

  document.querySelector("#pdf-redact").addEventListener("click", () => {
    source.replaceChildren(...sources.map((item, index) => new Option(item.file.name, index)));
    dialog.showModal();
    void loadSource();
  });
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
  dialog.addEventListener("close", () => {
    void raster?.destroy().catch(() => {});
    raster = pdf = start = undefined;
    canvas.width = canvas.height = 0;
    marks.clear();
  });
  source.addEventListener("change", () => {
    marks.clear();
    void loadSource();
  });
  page.addEventListener("change", () => void preview());

  function addMark(rect) {
    if (busy || canvas.hidden) return;
    const index = page.selectedIndex;
    const regions = [...(marks.get(index) || []), rect];
    marks.set(index, regions);
    paintMarks(canvas, [rect]);
    status.textContent = `${regions.length} marked areas on page ${page.value}.`;
    setBusy(false);
  }

  dialog.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    const [x, y, w, h] = [left, top, width, height].map((field) => Number(field.value) / 100);
    if (x + w > 1 || y + h > 1) {
      status.textContent = "The area must fit inside the page.";
      return;
    }
    addMark([x, y, x + w, y + h]);
  });
  function point(event) {
    const box = canvas.getBoundingClientRect();
    const clamp = (value) => Math.max(0, Math.min(1, value));
    return [clamp((event.clientX - box.left) / box.width), clamp((event.clientY - box.top) / box.height)];
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (busy || event.button !== 0 || !event.isPrimary) return;
    start = point(event);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointercancel", () => { start = undefined; });
  canvas.addEventListener("pointerup", (event) => {
    if (!start || !event.isPrimary) return;
    const [x, y] = point(event);
    const [a, b] = start;
    start = undefined;
    if (Math.abs(x - a) < 0.003 || Math.abs(y - b) < 0.003) return;
    addMark([Math.min(x, a), Math.min(y, b), Math.max(x, a), Math.max(y, b)]);
  });
  undo.addEventListener("click", () => {
    const index = page.selectedIndex;
    const regions = marks.get(index);
    regions.pop();
    if (!regions.length) marks.delete(index);
    void preview();
  });
  download.addEventListener("click", async () => {
    if (!marks.size || busy) return;
    setBusy(true);
    const surface = document.createElement("canvas");
    try {
      const output = await window.PDFLib.PDFDocument.create({ updateMetadata: false });
      for (let index = 0; index < pdf.numPages; index++) {
        status.textContent = `Flattening page ${index + 1} of ${pdf.numPages}…`;
        const size = await renderPdfPage(pdf, index, surface);
        paintMarks(surface, marks.get(index) || []);
        const png = await new Promise((resolve) => surface.toBlob(resolve, "image/png"));
        if (!png) throw new Error("Could not flatten a page.");
        const image = await output.embedPng(await png.arrayBuffer());
        output.addPage([size.width, size.height]).drawImage(image, { x: 0, y: 0, width: size.width, height: size.height });
      }
      const url = URL.createObjectURL(new Blob([await output.save()], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = sources[source.value].file.name.replace(/\.pdf$/i, "") + "-redacted.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = "Redacted copy downloaded. Review it before sharing.";
    } catch (error) {
      status.textContent = error.message || "Could not create a redacted copy.";
    } finally {
      surface.width = surface.height = 0;
      setBusy(false);
    }
  });
}
