import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { buildPivot, calculateSheet, calculateWorkbook, cellAddress, displayCell, parseCsv, toCsv } from "../sheet-model.js";
import { exportWorkbook, importWorkbook } from "../sheet-xlsx.js";

assert.equal(cellAddress(99, 25), "Z100");
const pivotSource = { A1: "Region", B1: "Sales", A2: "North", B2: "4", A3: "South", B3: "3", A4: "North", B4: "=B2+2" };
const pivotConfig = { range: "A1:B4", group: "A", measure: "B", aggregate: "sum" };
assert.deepEqual(buildPivot(pivotSource, pivotConfig).cells, { A1: "Region", B1: "SUM of Sales", A2: "North", B2: "10", A3: "South", B3: "3" });
assert.equal(buildPivot(pivotSource, { ...pivotConfig, aggregate: "average" }).cells.B2, "5");
assert.equal(buildPivot(pivotSource, { ...pivotConfig, aggregate: "count" }).cells.B2, "2");
assert.throws(() => buildPivot(pivotSource, { ...pivotConfig, group: "C" }), /within/);
assert.equal(displayCell(0.375, "percent", "en-US"), "37.50%");
assert.equal(displayCell("#ERROR!", "number", "en-US"), "#ERROR!");
assert.deepEqual(parseCsv('name,value\r\n"one, two","a ""quote"""\r\n"line\nbreak",5'), [
  ["name", "value"], ["one, two", 'a "quote"'], ["line\nbreak", "5"],
]);
assert.throws(() => parseCsv('"never closed'), /unclosed/);
assert.deepEqual(parseCsv('name\t"one, two"\r\n"line\nbreak"\t"with\ttab"', "\t"), [
  ["name", "one, two"], ["line\nbreak", "with\ttab"],
]);
assert.throws(() => parseCsv("x,".repeat(26) + "x"), /column/);
assert.throws(() => parseCsv("x\n".repeat(101)), /row/);

const cells = { A1: "2", A2: "3", B1: "=A1+A2*4", B2: "=SUM(A1:A2,B1)", C1: "=AVERAGE(A1:A2)", C2: "=MIN(A2,A1)", D1: "=MAX(A1:A2)", D2: "=1/0", E1: "=E2", E2: "=E1", F1: "=unknown(3)" };
const valueAt = calculateSheet(cells);
assert.equal(valueAt("B1"), 14);
assert.equal(valueAt("B2"), 19);
assert.equal(valueAt("C1"), 2.5);
assert.equal(valueAt("C2"), 2);
assert.equal(valueAt("D1"), 3);
assert.equal(valueAt("D2"), "#DIV/0!");
assert.equal(valueAt("E1"), "#CYCLE!");
assert.equal(valueAt("F1"), "#ERROR!");
const linked = [
  { name: "Totals", cells: { A1: "=SUM('Q1 data'!$A$1:$A$2)", A2: "=missing!A1", A3: "='Q1 data'!B3" } },
  { name: "Q1 data", cells: { A1: "6", A2: "8", B3: "=Totals!A3" } },
];
assert.equal(calculateWorkbook(linked, 0)("A1"), 14);
assert.equal(calculateWorkbook(linked, 0)("A2"), "#REF!");
assert.equal(calculateWorkbook(linked, 0)("A3"), "#CYCLE!");
assert.deepEqual(parseCsv(toCsv({ A1: "2", B1: "=A1*3", A2: 'a,"b"', B2: "@external" })), [["2", "6"], ['a,"b"', "'@external"]]);
console.log("Sheets calculations, CSV quoting, and input limits passed.");

const zipContext = { Uint8Array, Uint16Array, Uint32Array, Int32Array, TextEncoder, TextDecoder };
vm.runInNewContext(fs.readFileSync(new URL("../assets/vendor/fflate.min.js", import.meta.url), "utf8"), zipContext);
const zip = zipContext.fflate;
const dom = new JSDOM();
try {
  const sheets = [{ name: "Sales & costs", cells: { A1: "10", A2: "20", A3: "=SUM(A1:A2)", B1: "001", B2: "'=literal" }, formats: { A3: "number", C1: "percent" } }, { name: "Notes", cells: { A1: 'Quotes and <symbols> "work"' }, formats: {} }];
  const validation = { C4: ["Ready", "On hold"], C5: ["Ready", "On hold"] };
  const bytes = exportWorkbook([{ ...sheets[0], freezeFirstRow: true, validation }, sheets[1]], zip);
  const imported = importWorkbook(bytes, zip, dom.window.DOMParser);
  assert.deepEqual(imported.map(({ name, cells, formats }) => ({ name, cells, formats })), sheets);
  assert.equal(calculateSheet(imported[0].cells)("A3"), 30);
  assert.equal(imported[0].freezeFirstRow, true);
  assert.equal(imported[1].freezeFirstRow, false);
  assert.deepEqual(imported[0].validation, validation);
  const reopened = importWorkbook(exportWorkbook(linked, zip), zip, dom.window.DOMParser);
  assert.equal(reopened[0].cells.A1, linked[0].cells.A1);
  assert.equal(calculateWorkbook(reopened, 0)("A1"), 14);
  const parts = zip.unzipSync(bytes);
  assert.match(zip.strFromU8(parts["xl/worksheets/sheet1.xml"]), /<f>SUM\(A1:A2\)<\/f><v>30<\/v>/);
  parts["xl/worksheets/sheet2.xml"] = zip.strToU8(zip.strFromU8(parts["xl/worksheets/sheet2.xml"]).replace('r="A1"', 'r="AA1"'));
  assert.throws(() => importWorkbook(zip.zipSync(parts), zip, dom.window.DOMParser), /26-column/);
} finally {
  dom.window.close();
}
console.log("Excel workbook round trip, formulas, and input bounds passed.");
