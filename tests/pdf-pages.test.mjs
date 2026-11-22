import assert from "node:assert/strict";
import * as pdf from "pdf-lib";
import { buildPdf, parsePages } from "../pdf-pages.js";
import { cropBoxFromMargins } from "../pdf-crop.js";
import { addPdfComments, readPdfComments } from "../pdf-comments.js";

const inkDocument = await pdf.PDFDocument.create();
inkDocument.addPage([200, 400]);
const inkPath = [[20, 30], [30, 55], [47, 32]];
addPdfComments(inkDocument, [
  { pageIndex: 0, kind: "ink", text: "Review", path: inkPath },
  { pageIndex: 0, kind: "stamp", stamp: "Approved", quad: [[20, 60], [20, 120], [40, 60], [40, 120]] },
], pdf);
const reopenedInk = await pdf.PDFDocument.load(await inkDocument.save());
const ink = reopenedInk.getPage(0).node.Annots().lookup(0, pdf.PDFDict);
assert.equal(ink.lookup(pdf.PDFName.of("Subtype")).asString(), "/Ink");
assert.equal(ink.lookup(pdf.PDFName.of("InkList")).toString(), "[ [ 20 30 30 55 47 32 ] ]");
assert.ok(ink.lookup(pdf.PDFName.of("AP"), pdf.PDFDict).lookup(pdf.PDFName.of("N"), pdf.PDFRawStream));
const stamp = reopenedInk.getPage(0).node.Annots().lookup(1, pdf.PDFDict);
assert.equal(stamp.lookup(pdf.PDFName.of("Subtype")).asString(), "/Stamp");
assert.equal(stamp.lookup(pdf.PDFName.of("Name")).asString(), "/Approved");
assert.equal(stamp.lookup(pdf.PDFName.of("Rect")).toString(), "[ 20 60 40 120 ]");
assert.ok(stamp.lookup(pdf.PDFName.of("AP"), pdf.PDFDict).lookup(pdf.PDFName.of("N"), pdf.PDFRawStream));
stamp.set(pdf.PDFName.of("F"), pdf.PDFNumber.of(512));
const editable = readPdfComments(reopenedInk, pdf);
assert.equal(editable.length, 1);
assert.equal(editable[0].text, "Review");
editable[0].text = "Updated: résumé";
const originalAppearance = ink.lookup(pdf.PDFName.of("AP"), pdf.PDFDict).get(pdf.PDFName.of("N"));
addPdfComments(reopenedInk, editable, pdf);
assert.equal(ink.lookup(pdf.PDFName.of("Contents"), pdf.PDFHexString).decodeText(), "Updated: résumé");
assert.equal(ink.lookup(pdf.PDFName.of("AP"), pdf.PDFDict).get(pdf.PDFName.of("N")), originalAppearance);
assert.equal(reopenedInk.getPage(0).node.Annots().size(), 2);

const margins = { left: 10, top: 20, right: 30, bottom: 25 };
assert.deepEqual(cropBoxFromMargins({
  width: 400, height: 600, convertToPdfPoint: (x, y) => [10 + x, 630 - y],
}, margins), [50, 180, 240, 330]);
assert.deepEqual(cropBoxFromMargins({
  width: 600, height: 400, convertToPdfPoint: (x, y) => [10 + y, 30 + x],
}, margins), [90, 90, 220, 360]);

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
