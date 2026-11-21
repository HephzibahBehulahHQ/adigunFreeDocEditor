export function parsePages(input, count) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 200) throw new Error("Choose a PDF with 1–200 pages.");
  if (!input.trim()) return Array.from({ length: count }, (_, index) => index);
  const selected = new Set();
  for (const part of input.split(",")) {
    const range = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(part.trim());
    if (!range) throw new Error("Use page numbers or ranges separated by commas.");
    const start = Number(range[1]);
    const end = Number(range[2] ?? range[1]);
    if (start < 1 || end > count || start > end) throw new Error(`Choose pages between 1 and ${count}.`);
    for (let page = start; page <= end; page++) {
      if (selected.has(page - 1)) throw new Error("List each page only once per source PDF.");
      selected.add(page - 1);
    }
  }
  return [...selected];
}

export async function buildPdf(sources, { PDFDocument, degrees, StandardFonts, rgb }, { numberPages = false } = {}) {
  if (!sources.length) throw new Error("Add a PDF before exporting.");
  const output = await PDFDocument.create();
  for (const { document, selection, rotation } of sources) {
    if (document.getForm().getFields().length) {
      throw new Error("Remove interactive or signed forms before using page export.");
    }
    const indices = parsePages(selection, document.getPageCount());
    if (output.getPageCount() + indices.length > 200) throw new Error("Select at most 200 pages in total.");
    const pages = await output.copyPages(document, indices);
    for (const page of pages) {
      if (rotation) page.setRotation(degrees((page.getRotation().angle + rotation + 360) % 360));
      output.addPage(page);
    }
  }
  if (numberPages) {
    const font = await output.embedFont(StandardFonts.Helvetica);
    for (const [index, page] of output.getPages().entries()) {
      const box = page.getCropBox();
      const rotation = (page.getRotation().angle + 360) % 360;
      const xInset = Math.min(24, box.width / 4);
      const yInset = Math.min(24, box.height / 4);
      const offsets = { 0: [xInset, yInset], 90: [box.width - xInset, yInset], 180: [box.width - xInset, box.height - yInset], 270: [xInset, box.height - yInset] };
      const [x, y] = offsets[rotation] ?? offsets[0];
      page.drawText(String(index + 1), { x: box.x + x, y: box.y + y, font, size: 10, color: rgb(.18, .22, .29), rotate: degrees(rotation) });
    }
  }
  return output.save();
}
