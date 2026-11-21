export function openPdfRaster(data) {
  const renderer = window.pdfjsLib;
  renderer.GlobalWorkerOptions.workerSrc = new URL("./assets/vendor/pdf.worker.min.js", import.meta.url).href;
  return renderer.getDocument({ data, isEvalSupported: false, enableXfa: false });
}

export async function renderPdfPage(document, index, canvas, rotation = 0, maxDimension = 3500) {
  const page = await document.getPage(index + 1);
  const angle = (page.rotate + rotation) % 360;
  const size = page.getViewport({ scale: 1, rotation: angle });
  const scale = Math.min(2.5, maxDimension / Math.max(size.width, size.height));
  const viewport = page.getViewport({ scale, rotation: angle });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  try {
    await page.render({ canvasContext: canvas.getContext("2d"), viewport, background: "white" }).promise;
  } finally {
    page.cleanup();
  }
  return size;
}
