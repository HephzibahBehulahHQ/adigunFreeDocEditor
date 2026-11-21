import assert from "node:assert/strict";
import * as pdf from "pdf-lib";
import { buildPdf, parsePages } from "../pdf-pages.js";

assert.deepEqual(parsePages("3, 1-2", 3), [2, 0, 1]);
assert.deepEqual(parsePages("", 2), [0, 1]);
assert.throws(() => parsePages("1,1", 2), /only once/);
assert.throws(() => parsePages("2-3", 2), /between/);
const first = await pdf.PDFDocument.create();
first.addPage([200, 400]);
first.addPage([300, 600]).setRotation(pdf.degrees(90));
const second = await pdf.PDFDocument.create();
second.addPage([500, 700]);
const output = await pdf.PDFDocument.load(await buildPdf([
  { document: first, selection: "2,1", rotation: 90 },
  { document: second, selection: "", rotation: 0 },
], pdf));
assert.deepEqual(output.getPages().map((page) => [page.getWidth(), page.getRotation().angle]), [[300, 180], [200, 90], [500, 0]]);
assert.equal(first.getPages()[1].getRotation().angle, 90);
const arranged = await pdf.PDFDocument.load(await buildPdf([{
  document: first, selection: "", rotation: 0,
  plan: [{ index: 1, rotation: 90 }, { index: 0, rotation: 270 }, { index: 1, rotation: 0 }],
}], pdf));
assert.deepEqual(arranged.getPages().map((page) => [page.getWidth(), page.getRotation().angle]), [[300, 180], [200, 270], [300, 90]]);
const form = second.getForm();
form.createTextField("name");
await assert.rejects(buildPdf([{ document: second, selection: "", rotation: 0 }], pdf), /interactive or signed/);
const widgetSource = await pdf.PDFDocument.create();
const formPage = widgetSource.addPage([300, 600]);
widgetSource.addPage([400, 700]);
const field = widgetSource.getForm().createTextField("Approval");
field.addToPage(formPage, { x: 20, y: 20, width: 200, height: 30 });
field.setText("Operations");
const file = new Blob([await widgetSource.save()]);
const reordered = await pdf.PDFDocument.load(await buildPdf([{
  document: widgetSource, file, selection: "", rotation: 0, plan: [{ index: 1, rotation: 90 }, { index: 0, rotation: 0 }],
}], pdf));
assert.deepEqual(reordered.getPages().map((page) => [page.getWidth(), page.getRotation().angle]), [[400, 90], [300, 0]]);
assert.equal(reordered.getForm().getTextField("Approval").getText(), "Operations");
await assert.rejects(buildPdf([{ document: widgetSource, file, selection: "1", rotation: 0 }], pdf), /each original page exactly once/);
console.log("PDF page selection, order, relative rotation, and form protection passed.");
