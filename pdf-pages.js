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

export function sourcePages({ document, selection, plan }) {
  const count = document.getPageCount();
  if (!plan) return parsePages(selection, count).map((index) => ({ index, rotation: 0 }));
  if (!plan.length || plan.length > 200 || !plan.every(({ index, rotation }) =>
    Number.isInteger(index) && index >= 0 && index < count && [0, 90, 180, 270].includes(rotation))) {
    throw new Error("Arrange between 1 and 200 valid source pages.");
  }
  return plan;
}

export async function buildPdf(sources, { PDFDocument, PDFName, PDFSignature, degrees, StandardFonts, rgb }, { numberPages = false, footer = "" } = {}) {
  if (!sources.length) throw new Error("Add a PDF before exporting.");
  function protectedDocument(document) {
    return document.catalog.has(PDFName.of("Perms")) || document.catalog.getAcroForm()?.dict.has(PDFName.of("XFA"));
  }
  function rotatePage(page, rotation, extra) {
    if (rotation || extra) page.setRotation(degrees((page.getRotation().angle + rotation + extra + 360) % 360));
  }
  let output;
  const [first] = sources;
  if (sources.length === 1 && first.file && !protectedDocument(first.document)) {
    const fields = first.document.getForm().getFields();
    if (fields.length) {
      const plan = sourcePages(first);
      const count = first.document.getPageCount();
      const fullOrder = plan.length === count && new Set(plan.map((entry) => entry.index)).size === count;
      if (fields.some((field) => field instanceof PDFSignature)) throw new Error("Signed PDF pages require a compatible signing application.");
      if (!fullOrder) {
        throw new Error("Keep each original page exactly once to reorder or rotate this form. Download individual pages from a flattened copy.");
      }
      output = await PDFDocument.load(await first.file.arrayBuffer(), { updateMetadata: false });
      const pages = output.getPages();
      for (let index = count - 1; index >= 0; index--) output.removePage(index);
      for (const { index, rotation } of plan) {
        const page = pages[index];
        rotatePage(page, first.rotation ?? 0, rotation);
        output.addPage(page);
      }
    }
  }
  if (!output) {
    output = await PDFDocument.create();
    for (const source of sources) {
      const { document, rotation = 0 } = source;
      if (protectedDocument(document) || document.getForm().getFields().length) {
        throw new Error("Remove interactive or signed forms before using page export.");
      }
      const plan = sourcePages(source);
      if (output.getPageCount() + plan.length > 200) throw new Error("Select at most 200 pages in total.");
      const indices = [...new Set(plan.map((entry) => entry.index))];
      const copied = await output.copyPages(document, indices);
      const available = new Map(indices.map((index, offset) => [index, copied[offset]]));
      for (const { index, rotation: extra } of plan) {
        const page = available.get(index) || (await output.copyPages(document, [index]))[0];
        available.delete(index);
        rotatePage(page, rotation, extra);
        output.addPage(page);
      }
    }
  }
  if (numberPages || footer) {
    const font = await output.embedFont(StandardFonts.Helvetica);
    for (const [index, page] of output.getPages().entries()) {
      const box = page.getCropBox();
      const rotation = (page.getRotation().angle + 360) % 360;
      const xInset = Math.min(24, box.width / 4);
      const yInset = Math.min(24, box.height / 4);
      const offsets = { 0: [xInset, yInset], 90: [box.width - xInset, yInset], 180: [box.width - xInset, box.height - yInset], 270: [xInset, box.height - yInset] };
      const [x, y] = offsets[rotation] ?? offsets[0];
      const text = [footer, numberPages ? String(index + 1) : ""].filter(Boolean).join(" · ");
      const width = rotation === 90 || rotation === 270 ? box.height : box.width;
      const available = width - 2 * Math.min(xInset, yInset);
      let textWidth;
      try { textWidth = font.widthOfTextAtSize(text, 10); }
      catch { throw new Error("The footer contains characters unsupported by the PDF font."); }
      const size = Math.min(10, 10 * available / textWidth);
      page.drawText(text, { x: box.x + x, y: box.y + y, font, size, color: rgb(.18, .22, .29), rotate: degrees(rotation) });
    }
  }
  return output.save({ updateFieldAppearances: false });
}

export async function flattenPdfForm(source, { PDFDocument, PDFName, PDFSignature }) {
  const output = await PDFDocument.load(await source.file.arrayBuffer(), { updateMetadata: false });
  if (output.catalog.has(PDFName.of("Perms")) || output.catalog.getAcroForm()?.dict.has(PDFName.of("XFA")) ||
    output.getForm().getFields().some((field) => field instanceof PDFSignature)) {
    throw new Error("Choose an unsigned PDF without XFA fields to flatten form fields.");
  }
  output.getForm().flatten({ updateFieldAppearances: false });
  return output;
}
export async function compressPdf(bytes, { PDFDocument, PDFDict, PDFName, PDFRawStream }) {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const name = (value) => PDFName.of(value);
  const objects = pdf.context.enumerateIndirectObjects();
  const signed = objects.some(([, object]) => object instanceof PDFDict &&
    (object.has(name("ByteRange")) || ["/Sig", "/DocTimeStamp"].includes(object.get(name("Type"))?.toString())));
  if (signed || pdf.catalog.has(name("Perms")) || pdf.catalog.getAcroForm()?.dict.has(name("XFA"))) {
    throw new Error("Choose an unsigned PDF without XFA forms.");
  }
  const filter = name("Filter");
  for (const [ref, stream] of objects) {
    if (!(stream instanceof PDFRawStream) || stream.dict.has(filter) || stream.dict.has(name("DecodeParms")) ||
        stream.dict.has(name("F")) || ["/Metadata", "/ObjStm", "/XRef"].includes(stream.dict.get(name("Type"))?.toString())) continue;
    const contents = stream.getContents();
    if (contents.length < 64) continue;
    const data = new Blob([contents]).stream().pipeThrough(new CompressionStream("deflate"));
    const compressed = new Uint8Array(await new Response(data).arrayBuffer());
    if (compressed.length + 24 >= contents.length) continue;
    stream.dict.set(filter, name("FlateDecode"));
    pdf.context.assign(ref, PDFRawStream.of(stream.dict, compressed));
  }
  const output = await pdf.save({ updateFieldAppearances: false, useObjectStreams: true });
  return output.length < bytes.byteLength ? output : null;
}
