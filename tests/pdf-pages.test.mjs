import assert from "node:assert/strict";
import * as pdf from "pdf-lib";
import { buildPdf, compressPdf, parsePages } from "../pdf-pages.js";
import { cropBoxFromMargins } from "../pdf-crop.js";
import { addPdfComments, readPdfComments } from "../pdf-comments.js";

const compressible = await pdf.PDFDocument.create();
const compressionPage = compressible.addPage([300, 400]);
compressionPage.drawText("Selectable text");
const commands = "q Q\n".repeat(2000);
const raw = compressible.context.stream(commands);
const rawRef = compressible.context.register(raw);
compressionPage.node.addContentStream(rawRef);
const compressionField = compressible.getForm().createTextField("Field");
compressionField.addToPage(compressionPage, { x: 50, y: 50, width: 100, height: 25 });
compressionField.setText("Preserved value");
const originalCompression = await compressible.save();
const smaller = await compressPdf(originalCompression, pdf);
assert.ok(smaller && smaller.length < originalCompression.length / 2);
const reopenedCompression = await pdf.PDFDocument.load(smaller);
const compressedStream = reopenedCompression.context.lookup(rawRef, pdf.PDFRawStream);
assert.equal(compressedStream.dict.get(pdf.PDFName.of("Filter")).toString(), "/FlateDecode");
assert.equal(new TextDecoder().decode(pdf.decodePDFRawStream(compressedStream).decode()), commands);
assert.equal(reopenedCompression.getForm().getTextField("Field").getText(), "Preserved value");
assert.equal(await compressPdf(smaller, pdf), null);
compressible.catalog.set(pdf.PDFName.of("Perms"), compressible.context.obj({}));
await assert.rejects(compressPdf(await compressible.save(), pdf), /unsigned PDF/);

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
const pageWithReplies = reopenedInk.getPage(0);
const inkReference = pageWithReplies.node.Annots().get(0);
const popup = reopenedInk.context.register(reopenedInk.context.obj({ Subtype: "Popup", Parent: inkReference, Rect: [50, 50, 100, 120] }));
pageWithReplies.node.addAnnot(popup);
const threaded = reopenedInk.context.register(reopenedInk.context.obj({ Subtype: "Text", Contents: pdf.PDFHexString.fromText("Parent") }));
pageWithReplies.node.addAnnot(threaded);
const reply = reopenedInk.context.register(reopenedInk.context.obj({ Subtype: "Text", IRT: threaded }));
pageWithReplies.node.addAnnot(reply);
const currentComments = readPdfComments(reopenedInk, pdf);
assert.deepEqual(currentComments.map((comment) => comment.original.removable), [true, false, false]);
assert.deepEqual(currentComments.map((comment) => comment.original.movable), [true, false, false]);
assert.throws(() => addPdfComments(reopenedInk, [{ ...currentComments[0], center: [0, 0] }], pdf), /inside the page/);
addPdfComments(reopenedInk, [{ ...currentComments[0], center: [63.5, 82.5] }], pdf);
assert.equal(ink.lookup(pdf.PDFName.of("Rect")).toString(), "[ 48 68 79 97 ]");
assert.equal(ink.lookup(pdf.PDFName.of("InkList")).toString(), "[ [ 50 70 60 95 77 72 ] ]");
assert.equal(reopenedInk.context.lookup(popup).lookup(pdf.PDFName.of("Rect")).toString(), "[ 80 90 130 160 ]");
assert.equal(ink.lookup(pdf.PDFName.of("AP"), pdf.PDFDict).get(pdf.PDFName.of("N")), originalAppearance);
assert.throws(() => addPdfComments(reopenedInk, [{ ...currentComments[1], center: [50, 50] }], pdf), /threaded/);
assert.throws(() => addPdfComments(reopenedInk, [{ ...currentComments[1], removed: true }], pdf), /threaded/);
addPdfComments(reopenedInk, [{ ...currentComments[0], removed: true }], pdf);
assert.deepEqual(Array.from({ length: pageWithReplies.node.Annots().size() }, (_, index) => pageWithReplies.node.Annots().get(index)),
  [pageWithReplies.node.Annots().get(0), threaded, reply]);
assert.equal(pageWithReplies.node.Annots().lookup(0), stamp);

const highlightDocument = await pdf.PDFDocument.create();
const highlightPage = highlightDocument.addPage([200, 400]);
addPdfComments(highlightDocument, [{
  pageIndex: 0, kind: "highlight", text: "", quad: [[20, 40], [50, 40], [20, 30], [50, 30]],
}], pdf);
addPdfComments(highlightDocument, [{ ...readPdfComments(highlightDocument, pdf)[0], center: [85, 115] }], pdf);
const highlight = highlightPage.node.Annots().lookup(0, pdf.PDFDict);
assert.equal(highlight.lookup(pdf.PDFName.of("QuadPoints")).toString(), "[ 70 120 100 120 70 110 100 110 ]");

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
