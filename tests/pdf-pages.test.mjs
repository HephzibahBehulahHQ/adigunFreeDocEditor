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
const form = second.getForm();
form.createTextField("name");
await assert.rejects(buildPdf([{ document: second, selection: "", rotation: 0 }], pdf), /interactive or signed/);
console.log("PDF page selection, order, relative rotation, and form protection passed.");
