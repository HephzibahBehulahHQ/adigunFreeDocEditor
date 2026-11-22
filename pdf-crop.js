import { openPdfRaster, renderPdfPage } from "./pdf-render.js";

export function cropBoxFromMargins(viewport, { left, top, right, bottom }) {
  const [x1, y1] = viewport.convertToPdfPoint(left * viewport.width / 100, top * viewport.height / 100);
  const [x2, y2] = viewport.convertToPdfPoint((1 - right / 100) * viewport.width, (1 - bottom / 100) * viewport.height);
  return [Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)];
}

export function bindPdfCrop(sources, showPreview) {
  const dialog = document.querySelector("#pdf-crop-dialog");
  const form = dialog.querySelector("form");
  const { source, page } = form.elements;
  const controls = [...form.elements];
  const canvas = dialog.querySelector("canvas");
  const status = dialog.querySelector("[role=status]");
  const download = form.querySelector("[type=submit]");
  const original = document.createElement("canvas");
  const edges = ["left", "top", "right", "bottom"];
  let task;
  let raster;
  let viewport;
  let busy = false;

  function refresh() {
    for (const control of controls) control.disabled = busy;
    download.disabled = true;
    if (busy || !viewport) return;
    const margins = readMargins();
    const context = canvas.getContext("2d");
    context.drawImage(original, 0, 0);
    if (edges.some((edge) => !Number.isFinite(margins[edge]) || margins[edge] < 0 || margins[edge] > 99) ||
        margins.left + margins.right >= 99 || margins.top + margins.bottom >= 99) {
      status.textContent = "Leave more than 1% of the page width and height.";
      return;
    }
    const x = margins.left * canvas.width / 100;
    const y = margins.top * canvas.height / 100;
    const endX = (1 - margins.right / 100) * canvas.width;
    const endY = (1 - margins.bottom / 100) * canvas.height;
    context.fillStyle = "rgba(18, 27, 43, 0.55)";
    context.fillRect(0, 0, canvas.width, y);
    context.fillRect(0, endY, canvas.width, canvas.height - endY);
    context.fillRect(0, y, x, endY - y);
    context.fillRect(endX, y, canvas.width - endX, endY - y);
    status.textContent = "The lighter area will remain visible.";
    download.disabled = edges.every((edge) => margins[edge] === 0);
  }

  function readMargins() {
    return Object.fromEntries(edges.map((edge) => [edge, form.elements[edge].valueAsNumber]));
  }

  async function draw(loadSource) {
    busy = true;
    viewport = undefined;
    canvas.hidden = true;
    refresh();
    status.textContent = "Rendering the PDF page…";
    try {
      if (loadSource) {
        page.replaceChildren();
        await task?.destroy();
        const item = sources[source.value];
        const lib = window.PDFLib;
        if (item.document.catalog.has(lib.PDFName.of("Perms")) || item.document.catalog.getAcroForm()?.dict.has(lib.PDFName.of("XFA")) ||
            item.document.getForm().getFields().some((field) => field instanceof lib.PDFSignature)) throw new Error("Choose an unsigned PDF without XFA fields.");
        task = openPdfRaster(new Uint8Array(await item.file.arrayBuffer()));
        raster = await task.promise;
        page.replaceChildren(...Array.from({ length: raster.numPages }, (_, index) => new Option(index + 1)));
      }
      viewport = await renderPdfPage(raster, page.selectedIndex, original, 0, 1200);
      canvas.width = original.width;
      canvas.height = original.height;
      canvas.hidden = false;
    } catch (error) {
      status.textContent = error.message || "Could not preview this page.";
    } finally {
      busy = false;
      refresh();
    }
  }

  document.querySelector("#pdf-crop-open").addEventListener("click", () => {
    source.replaceChildren(...sources.map((item, index) => new Option(item.file.name, index)));
    for (const edge of edges) form.elements[edge].value = 0;
    dialog.showModal();
    void draw(true);
  });
  source.addEventListener("change", () => void draw(true));
  page.addEventListener("change", () => void draw(false));
  for (const edge of edges) form.elements[edge].addEventListener("input", refresh);
  form.querySelector("[data-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
  dialog.addEventListener("close", () => {
    void task?.destroy().catch(() => {});
    task = raster = viewport = undefined;
    canvas.width = canvas.height = original.width = original.height = 0;
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || download.disabled) return;
    const box = cropBoxFromMargins(viewport, readMargins());
    busy = true;
    refresh();
    try {
      const input = sources[source.value];
      const output = await window.PDFLib.PDFDocument.load(await input.file.arrayBuffer(), { updateMetadata: false });
      output.getPage(page.selectedIndex).setCropBox(...box);
      const name = input.file.name.replace(/\.pdf$/i, "") + "-cropped.pdf";
      const file = new File([await output.save({ updateFieldAppearances: false })], name, { type: "application/pdf" });
      showPreview(file, page.selectedIndex + 1);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(file);
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      busy = false;
      refresh();
      status.textContent = "Cropped copy downloaded.";
    } catch (error) {
      busy = false;
      refresh();
      status.textContent = error.message || "Could not create a cropped copy.";
    }
  });
}
