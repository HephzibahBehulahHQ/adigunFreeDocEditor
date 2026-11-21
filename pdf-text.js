import { openPdfRaster, renderPdfPage } from "./pdf-render.js";

export function bindPdfText(sources, preview) {
  const dialog = document.querySelector("#pdf-text-dialog");
  const form = dialog.querySelector("form");
  const { source, page, left, top, size, text } = form.elements;
  const canvas = dialog.querySelector("canvas");
  const close = dialog.querySelector("[data-close]");
  const save = form.querySelector("[type=submit]");
  const status = dialog.querySelector("[role=status]");
  const controls = [...form.elements];
  let task;
  let raster;
  let viewport;
  let original;
  let signature = false;
  let busy = false;
  let saved = false;

  function setBusy(value) {
    busy = value;
    for (const field of controls) field.disabled = value;
    save.disabled = value || !viewport;
  }

  function updatePreview() {
    if (!viewport || !original) return;
    const context = canvas.getContext("2d");
    context.drawImage(original, 0, 0);
    const fontSize = Math.max(1, (size.valueAsNumber || 18) * canvas.width / viewport.width);
    context.font = `${signature ? "italic " : ""}${fontSize}px ${signature ? "Georgia" : "Arial"}`;
    context.fillStyle = "#192640";
    context.fillText(text.value, Number(left.value) * canvas.width / 100, Number(top.value) * canvas.height / 100);
  }

  async function draw() {
    setBusy(true);
    viewport = undefined;
    try {
      original = document.createElement("canvas");
      viewport = await renderPdfPage(raster, page.selectedIndex, original, 0, 1600);
      canvas.width = original.width;
      canvas.height = original.height;
      canvas.hidden = false;
      updatePreview();
      status.textContent = "Click the page or enter the placement percentages.";
    } catch (error) {
      canvas.hidden = true;
      status.textContent = error.message || "The page could not be rendered.";
    } finally { setBusy(false); }
  }

  async function load() {
    setBusy(true);
    viewport = undefined;
    canvas.hidden = true;
    try {
      await task?.destroy();
      const item = sources[source.value];
      const lib = window.PDFLib;
      if (item.document.catalog.has(lib.PDFName.of("Perms")) || item.document.catalog.getAcroForm()?.dict.has(lib.PDFName.of("XFA")) ||
        item.document.getForm().getFields().some((field) => field instanceof lib.PDFSignature)) {
        throw new Error("Choose an unsigned PDF without XFA fields.");
      }
      task = openPdfRaster(new Uint8Array(await item.file.arrayBuffer()));
      raster = await task.promise;
      page.replaceChildren(...Array.from({ length: raster.numPages }, (_, index) => new Option(index + 1)));
      await draw();
    } catch (error) {
      page.replaceChildren();
      status.textContent = error.message || "Could not open the PDF.";
    } finally { setBusy(false); }
  }

  function open(signing) {
    signature = signing;
    saved = false;
    text.value = "";
    size.value = signing ? 24 : 14;
    left.value = 10;
    top.value = 25;
    dialog.querySelector("h2").textContent = signing ? "Place a visible signature" : "Add text to PDF";
    dialog.querySelector("[data-signature-info]").hidden = !signing;
    source.replaceChildren(...sources.map((item, index) => new Option(item.file.name, index)));
    dialog.showModal();
    void load();
  }
  document.querySelector("#pdf-text-open").addEventListener("click", () => open(false));
  document.querySelector("#pdf-sign-open").addEventListener("click", () => open(true));
  source.addEventListener("change", () => { saved = false; void load(); });
  page.addEventListener("change", () => { saved = false; void draw(); });
  for (const field of [left, top, size, text]) field.addEventListener("input", () => { saved = false; updatePreview(); });
  canvas.addEventListener("click", (event) => {
    const bounds = canvas.getBoundingClientRect();
    const clamp = (value) => Math.max(0, Math.min(100, value * 100)).toFixed(1);
    left.value = clamp((event.clientX - bounds.left) / bounds.width);
    top.value = clamp((event.clientY - bounds.top) / bounds.height);
    saved = false;
    updatePreview();
    text.focus();
  });
  const canClose = () => !busy && (saved || !text.value.trim() || window.confirm("Discard the unsaved PDF placement?"));
  close.addEventListener("click", () => { if (canClose()) dialog.close(); });
  dialog.addEventListener("cancel", (event) => { if (!canClose()) event.preventDefault(); });
  dialog.addEventListener("close", () => {
    void task?.destroy().catch(() => {});
    task = raster = viewport = original = undefined;
    canvas.width = canvas.height = 0;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !viewport || !text.value.trim() || !form.reportValidity()) return;
    setBusy(true);
    try {
      const { PDFDocument, StandardFonts, degrees, rgb } = window.PDFLib;
      const input = sources[source.value];
      const output = await PDFDocument.load(await input.file.arrayBuffer(), { updateMetadata: false });
      const destination = output.getPage(page.selectedIndex);
      const font = await output.embedFont(signature ? StandardFonts.TimesRomanItalic : StandardFonts.Helvetica);
      const value = text.value.trim();
      const fontSize = size.valueAsNumber;
      const xOffset = left.valueAsNumber * viewport.width / 100;
      const yOffset = top.valueAsNumber * viewport.height / 100;
      if (xOffset + font.widthOfTextAtSize(value, fontSize) > viewport.width || yOffset < fontSize || yOffset > viewport.height - fontSize * 0.2) {
        throw new Error("The placement extends beyond the page. Move it or reduce the text size.");
      }
      const [x, y] = viewport.convertToPdfPoint(xOffset, yOffset);
      destination.drawText(value, { x, y, size: fontSize, font, color: rgb(.1, .15, .25), rotate: degrees(destination.getRotation().angle) });
      const file = new File([await output.save({ updateFieldAppearances: false })],
        input.file.name.replace(/\.pdf$/i, "") + (signature ? "-with-signature.pdf" : "-with-text.pdf"), { type: "application/pdf" });
      preview(file, page.selectedIndex + 1);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(file);
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      saved = true;
      status.textContent = "PDF copy downloaded with the new text.";
    } catch (error) {
      const message = error.message || "Could not save the edited PDF.";
      status.textContent = message.startsWith("WinAnsi") ? "The selected font cannot render one or more of these characters." : message;
    } finally { setBusy(false); }
  });
}
