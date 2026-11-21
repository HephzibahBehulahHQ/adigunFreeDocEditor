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

export async function buildPdf(sources, { PDFDocument, degrees }) {
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
  return output.save();
}
