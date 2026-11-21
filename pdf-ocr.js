import { parsePages } from "./pdf-pages.js";
import { openPdfRaster, renderPdfPage } from "./pdf-render.js";

export function bindPdfOcr(sources) {
  const dialog = document.querySelector("#pdf-ocr-dialog");
  const form = dialog.querySelector("form");
  const { source, pages, result } = form.elements;
  const run = dialog.querySelector("[type=submit]");
  const close = dialog.querySelector("[data-close]");
  const progress = dialog.querySelector("[role=status]");
  const download = dialog.querySelector("[data-download]");
  document.querySelector("#pdf-ocr").addEventListener("click", () => {
    source.replaceChildren(...sources.map((item, index) => new Option(item.file.name, index)));
    pages.value = sources[0].selection;
    result.value = "";
    download.disabled = true;
    progress.textContent = "";
    dialog.showModal();
  });
  source.addEventListener("change", () => { pages.value = sources[source.value].selection; });
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", (event) => { if (run.disabled) event.preventDefault(); });
  result.addEventListener("input", () => { download.disabled = !result.value.trim(); });
  download.addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([result.value], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "recognized-text.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    for (const control of [source, pages, run, close, result, download]) control.disabled = true;
    result.value = "";
    let raster;
    let worker;
    const canvas = document.createElement("canvas");
    try {
      const item = sources[source.value];
      const indices = parsePages(pages.value, item.document.getPageCount());
      if (indices.length > 10) throw new Error("Select up to 10 pages per recognition run.");
      progress.textContent = "Loading English recognition…";
      raster = openPdfRaster(new Uint8Array(await item.file.arrayBuffer()));
      const pdf = await raster.promise;
      const base = new URL("./assets/vendor/ocr/", import.meta.url).href;
      worker = await window.Tesseract.createWorker("eng", 1, {
        corePath: base,
        langPath: base,
        workerPath: base + "worker.min.js",
        workerBlobURL: false,
        errorHandler: () => {},
      });
      const recognized = [];
      for (const index of indices) {
        progress.textContent = `Recognizing page ${index + 1} (${recognized.length + 1} of ${indices.length})…`;
        await renderPdfPage(pdf, index, canvas, item.rotation);
        const { data } = await worker.recognize(canvas);
        recognized.push(data.text.trim());
      }
      result.value = recognized.join("\n\n").trim();
      progress.textContent = result.value ? "Review the recognized text before downloading." : "No text was recognized.";
    } catch (error) {
      progress.textContent = error.message || "Recognition failed.";
    } finally {
      await Promise.allSettled([worker?.terminate(), raster?.destroy()]);
      canvas.width = canvas.height = 0;
      for (const control of [source, pages, run, close, result]) control.disabled = false;
      download.disabled = !result.value.trim();
    }
  });
}
