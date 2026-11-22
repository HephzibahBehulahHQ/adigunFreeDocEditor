import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { maxRows, buildPivot, calculateSheet, calculateWorkbook, cellAddress, displayCell, parseChartRange, parseCsv, removeDuplicateRecords, renameSheetReferences, shiftCellFormula, sortSheetRange, splitColumnText, toCsv } from "../sheet-model.js";
import { exportWorkbook, importWorkbook } from "../sheet-xlsx.js";

assert.equal(cellAddress(99, 25), "Z100");
assert.equal(cellAddress(maxRows - 1, 25), "Z9999");
assert.equal(calculateSheet({ A9998: "7", A9999: "=SUM(A9998:A9998)" })("A9999"), 7);
assert.equal(shiftCellFormula("=SUM(A1:B2)+$A1+A$1+'Q1 data'!$B$2", 2, 1), "=SUM(B3:C4)+$A3+B$1+'Q1 data'!$B$2");
assert.equal(shiftCellFormula("=Z1", 0, 1), "=#REF!");
assert.equal(renameSheetReferences("=Input!A1+'Input old'!A2", new Map([["INPUT", "Input old"], ["INPUT OLD", "Owner's data"]])), "='Input old'!A1+'Owner''s data'!A2");
assert.equal(calculateSheet({ A1: "=SUM(#REF!:B2)" })("A1"), "#REF!");
const unsorted = { rows: 6, columns: 3, cells: { A1: "Rank", B1: "Name", A2: "10", B2: "North", C2: "=A2*2", A3: "2", B3: "West", C3: "=A3*2", B4: "Blank rank" }, unlockedCells: { B2: true } };
const sorted = sortSheetRange(unsorted, { range: "A1:C4", column: "A", direction: "asc" }, calculateSheet(unsorted.cells));
assert.deepEqual(sorted.cells, { A1: "Rank", B1: "Name", A2: "2", B2: "West", C2: "=A2*2", A3: "10", B3: "North", C3: "=A3*2", B4: "Blank rank" });
assert.deepEqual(sorted.unlockedCells, { B3: true });
assert.deepEqual(sortSheetRange({ ...unsorted, links: { B2: "https://example.com/" } },
  { range: "A1:C4", column: "A", direction: "asc" }, calculateSheet(unsorted.cells)).links, { B3: "https://example.com/" });
const duplicated = { rows: 6, columns: 3, cells: { A1: "Name", B1: "Region", A2: "River", B2: "North", A3: "river", B3: "NORTH", A4: "Canal", B4: "South", C3: "Keep" } };
const cleaned = removeDuplicateRecords(duplicated, "A1:B4", calculateSheet(duplicated.cells));
assert.equal(cleaned.duplicates, 1);
assert.deepEqual(cleaned.records.cells, { A1: "Name", B1: "Region", A2: "River", B2: "North", A3: "Canal", B3: "South", C3: "Keep" });
assert.deepEqual(splitColumnText({ rows: 4, columns: 3, cells: { A2: '"river;bank";north' } }, "A2:A4", ";"), [["A2", "river;bank"], ["B2", "north"]]);
assert.throws(() => splitColumnText({ rows: 4, columns: 3, cells: { A2: "river;north", B2: "Keep" } }, "A2", ";"), /overwrite B2/);
const pivotSource = { A1: "Region", B1: "Sales", A2: "North", B2: "4", A3: "South", B3: "3", A4: "North", B4: "=B2+2" };
const pivotConfig = { range: "A1:B4", group: "A", measure: "B", aggregate: "sum" };
assert.deepEqual(buildPivot(pivotSource, pivotConfig).cells, { A1: "Region", B1: "SUM of Sales", A2: "North", B2: "10", A3: "South", B3: "3" });
assert.equal(buildPivot(pivotSource, { ...pivotConfig, aggregate: "average" }).cells.B2, "5");
assert.equal(buildPivot(pivotSource, { ...pivotConfig, aggregate: "count" }).cells.B2, "2");
assert.throws(() => buildPivot(pivotSource, { ...pivotConfig, group: "C" }), /within/);
assert.equal(displayCell(0.375, "percent", "en-US"), "37.50%");
assert.equal(displayCell(1234.5, "decimal", "en-US"), "1234.50");
assert.equal(displayCell("#ERROR!", "number", "en-US"), "#ERROR!");
assert.deepEqual(parseCsv('name,value\r\n"one, two","a ""quote"""\r\n"line\nbreak",5'), [
  ["name", "value"], ["one, two", 'a "quote"'], ["line\nbreak", "5"],
]);
assert.throws(() => parseCsv('"never closed'), /unclosed/);
assert.deepEqual(parseCsv('name\t"one, two"\r\n"line\nbreak"\t"with\ttab"', "\t"), [
  ["name", "one, two"], ["line\nbreak", "with\ttab"],
]);
assert.throws(() => parseCsv("x,".repeat(26) + "x"), /column/);
assert.throws(() => parseCsv("x\n".repeat(maxRows + 1)), /row/);

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
const math = calculateSheet({
  A1: "-1.005", A2: "label", A3: "0x1", B1: "=ROUND(A1,2)",
  B2: "=ABS(A1)", B3: "=MOD(-5,3)", B4: "=COUNT(A1:A3,A2,A4,2E-2)",
  B5: "=ROUND(125,-1)", B6: "=MOD(2,0)", B7: "=ABS(A1:A2)",
});
assert.deepEqual(["B1", "B2", "B3", "B4", "B5", "B6", "B7"].map(math),
  [-1.01, 1.005, 1, 2, 130, "#DIV/0!", "#VALUE!"]);
const linked = [
  { name: "Totals", cells: { A1: "=SUM('Q1 data'!$A$1:$A$2)", A2: "=missing!A1", A3: "='Q1 data'!B3" } },
  { name: "Q1 data", cells: { A1: "6", A2: "8", B3: "=Totals!A3" } },
];
assert.equal(calculateWorkbook(linked, 0)("A1"), 14);
assert.equal(calculateWorkbook(linked, 0)("A2"), "#REF!");
assert.equal(calculateWorkbook(linked, 0)("A3"), "#CYCLE!");
const text = calculateWorkbook([
  { name: "Report", cells: {
    A1: '=UPPER(TRIM(\'Case Data\'!A1))&" "&LOWER("ID")&" ""001"""',
    A2: "=LEN(A1)", A3: "=LEN(B1)", A4: '=2+3&" units"', A5: '="#REF!"', A6: '=LOWER("no")*2',
  } },
  { name: "Case Data", cells: { A1: "  West   region " } },
], 0);
assert.deepEqual(["A1", "A2", "A3", "A4", "A5", "A6"].map(text),
  ['WEST REGION id "001"', 20, 0, "5 units", "#REF!", "#VALUE!"]);
assert.equal(shiftCellFormula('=A1+1E2&"B2"', 1, 1), '=B2+1E2&"B2"');
const logical = calculateSheet({
  A1: "10", A2: "ready", B1: '=IF(A1>=10,"Ready",1/0)', B2: '=IF(A2="READY",B1,missing!A1)',
  B3: "=NOT(B1<>B2)", B4: "=IF(FALSE,B4,4)", B5: "=IF(FALSE,100)",
  B6: '=IF(1+1&"x"="2x",TRUE(),FALSE())', B7: "=IF(TRUE,2,unsupported())",
  B8: "=IF(FALSE,missing!A1,TRUE)+2", B9: "=IF(FALSE,#REF!,3)",
});
assert.deepEqual(Array.from({ length: 9 }, (_, index) => logical("B" + (index + 1))),
  ["Ready", "Ready", true, 4, false, true, "#ERROR!", 3, 3]);
assert.equal(displayCell(true, "number"), "TRUE");
assert.equal(toCsv({ A1: "=TRUE", A2: "=FALSE" }), "TRUE\r\nFALSE");
const lookup = calculateWorkbook([
  { name: "Orders", cells: {
    A1: '=VLOOKUP("VALVE",\'Stock List\'!$A$1:$B$4,2,FALSE)',
    A2: '=VLOOKUP("mo?or",\'Stock List\'!A1:B4,2,0)',
    A3: '=VLOOKUP("tag~*",\'Stock List\'!A1:B4,2,FALSE)',
    A4: '=VLOOKUP(13,\'Stock List\'!D1:E4,2)',
    A5: '=VLOOKUP(2,\'Stock List\'!D1:E4,2,TRUE)',
    A6: '=VLOOKUP("valve",\'Stock List\'!A1:B4,3,FALSE)',
    A7: '=VLOOKUP("valve",\'Stock List\'!A1:B4,0,FALSE)',
  } },
  { name: "Stock List", cells: {
    A1: "Valve", B1: "2", A2: "Motor", B2: "Drive", A3: "Tag*", B3: "Literal", A4: "Valve", B4: "4",
    D1: "5", E1: "Five", D2: "10", E2: "First ten", D3: "10", E3: "Second ten", D4: "15", E4: "Fifteen",
  } },
], 0);
assert.deepEqual(Array.from({ length: 7 }, (_, index) => lookup("A" + (index + 1))),
  [2, "Drive", "Literal", "Second ten", "#N/A", "#REF!", "#VALUE!"]);
const dateSheets = [{ name: "Dates", formats: { A1: "date" }, cells: {
  A1: "=DATE(2024,2,29)", A2: "=YEAR(A1)", A3: "=MONTH(A1)", A4: "=DAY(A1)",
  B1: "=DATE(1900,2,29)", B2: "=DAY(60)", B3: "=DATE(2024,3,0)", B4: "=DATE(2023,14,29)",
  C1: "=DATE(10000,1,1)", C2: "=YEAR(-1)", C3: "=DATE(1904,1,1)",
} }];
const dates1900 = calculateWorkbook(dateSheets, 0);
assert.deepEqual(["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4", "C1", "C2", "C3"].map(dates1900),
  [45351, 2024, 2, 29, 60, 29, 45351, 45351, "#NUM!", "#NUM!", 1462]);
const dates1904 = calculateWorkbook(dateSheets, 0, true);
assert.equal(dates1904("A1"), 43889);
assert.equal(dates1904("C3"), 0);
assert.equal(displayCell(dates1904("A1"), "date", undefined, true), "2024-02-29");
assert.equal(displayCell(60, "date"), "1900-02-29");
const namedSheets = [
  { name: "Summary", cells: { A1: "=SUM(a1_orders)", A2: "=order_count+1", A3: '=VLOOKUP("Bolt",Price_List,2,FALSE)', A4: "=A1_orders" } },
  { name: "Jon's orders", cells: { A1: "11", A2: "9", B2: "Bolt", C2: "8", B3: "Washer", C3: "12" } },
];
const namedRanges = [
  { name: "A1_Orders", sheet: "Jon's orders", range: "A1:A2" },
  { name: "Order_Count", sheet: "Jon's orders", range: "A1" },
  { name: "Price_List", sheet: "Jon's orders", range: "B2:C3" },
  { name: "Last_Row", sheet: "Jon's orders", range: "A99:B100" },
];
assert.deepEqual(["A1", "A2", "A3", "A4"].map(calculateWorkbook(namedSheets, 0, false, namedRanges)),
  [20, 12, 8, "#VALUE!"]);
assert.equal(shiftCellFormula("=SUM(A1_Orders)+A1", 1, 1), "=SUM(A1_Orders)+B2");
assert.deepEqual(parseCsv(toCsv({ A1: "2", B1: "=A1*3", A2: 'a,"b"', B2: "@external" })), [["2", "6"], ['a,"b"', "'@external"]]);
console.log("Sheets calculations, CSV quoting, and input limits passed.");

const zipContext = { Uint8Array, Uint16Array, Uint32Array, Int32Array, TextEncoder, TextDecoder };
vm.runInNewContext(fs.readFileSync(new URL("../assets/vendor/fflate.min.js", import.meta.url), "utf8"), zipContext);
const zip = zipContext.fflate;
const dom = new JSDOM();
try {
  const pivotDefinition = { source: 0, range: "A1:B4", group: "A", measure: "B", aggregate: "sum" };
  const pivotCells = { A1: "Region", B1: "Units", A2: "North", B2: "4", A3: "South", B3: "7", A4: "North", B4: "2" };
  const pivotSheets = [
    { name: "Source", cells: pivotCells },
    { name: "Summary", ...buildPivot(pivotCells, pivotDefinition), pivot: pivotDefinition, chart: parseChartRange("A1:B3") },
  ];
  const pivotBytes = exportWorkbook(pivotSheets, zip);
  const pivotParts = zip.unzipSync(pivotBytes);
  assert.match(zip.strFromU8(pivotParts["xl/workbook.xml"]), /<pivotCache cacheId="2" r:id="rIdPivotCache2"/);
  assert.match(zip.strFromU8(pivotParts["xl/pivotCache/pivotCacheRecords2.xml"]), /<r><x v="0"\/><n v="4"\/><\/r>/);
  const pivotWorkbook = importWorkbook(pivotBytes, zip, dom.window.DOMParser);
  assert.deepEqual(pivotWorkbook.sheets[1].pivot, pivotDefinition);
  assert.deepEqual(pivotWorkbook.sheets[1].chart, pivotSheets[1].chart);
  const target = "https://example.com/?a=1&b=2";
  const linkedPivot = { ...pivotSheets[1], links: { A2: target, L24: target, B2: "javascript:alert(1)" } };
  const reopenedPivot = importWorkbook(exportWorkbook([pivotSheets[0], linkedPivot], zip), zip, dom.window.DOMParser).sheets[1];
  assert.deepEqual(reopenedPivot.links, { A2: target, L24: target });
  assert.equal(reopenedPivot.cells.A2, linkedPivot.cells.A2);
  assert.equal(reopenedPivot.rows, 24);
  assert.equal(reopenedPivot.columns, 12);
  assert.deepEqual(reopenedPivot.pivot, pivotDefinition);
  assert.deepEqual(reopenedPivot.chart, linkedPivot.chart);
  const jump = "#'Owner''s data'!B44";
  const workbookLinks = [{ name: "Home", cells: { A1: "Open data" }, links: { A1: jump } }, { name: "Owner's data", cells: { B44: "Target" } }];
  const workbookLinkBytes = exportWorkbook(workbookLinks, zip);
  const linkedParts = zip.unzipSync(workbookLinkBytes);
  assert.equal(linkedParts["xl/worksheets/_rels/sheet1.xml.rels"], undefined);
  assert.deepEqual(importWorkbook(workbookLinkBytes, zip, dom.window.DOMParser).sheets[0].links, { A1: jump });
  const [home, data] = workbookLinks;
  const definedLinkBytes = exportWorkbook([{ ...home, links: { A1: "#Sales" } }, data], zip, false,
    [{ name: "Sales", sheet: data.name, range: "B44:C45" }]);
  const definedLink = importWorkbook(definedLinkBytes, zip, dom.window.DOMParser);
  assert.deepEqual(definedLink.sheets[0].links, { A1: "#Sales" });
  assert.deepEqual(definedLink.namedRanges, [{ name: "Sales", sheet: data.name, range: "B44:C45" }]);
  assert.match(zip.strFromU8(zip.unzipSync(definedLinkBytes)["xl/worksheets/sheet1.xml"]), /location="Sales"/);
  const omitted = [];
  const stale = exportWorkbook([{ ...pivotSheets[0], cells: { ...pivotCells, B2: "9" } }, pivotSheets[1]], zip, false, [], (name) => omitted.push(name));
  assert.deepEqual(omitted, ["Summary"]);
  assert.equal(importWorkbook(stale, zip, dom.window.DOMParser).sheets[1].cells.B2, "6");
  assert.equal(importWorkbook(stale, zip, dom.window.DOMParser).sheets[1].pivot, undefined);
  const protectedSheets = [
    { name: "Schedule", cells: { A1: "Keep" }, protection: { objects: true, scenarios: true } },
    { name: "Locked", cells: { A1: "=1+2", B1: "Editable" }, unlockedCells: { B1: true, C1: true },
      formats: { B1: "number" }, protection: { password: "ABCD", formatCells: false } },
    { name: "Editable", cells: { A1: "Change" }, hidden: true },
  ];
  const structureProtection = { lockStructure: true, workbookPassword: "ABCD", lockWindows: false };
  const protectedBytes = exportWorkbook(protectedSheets, zip, false, [], undefined, structureProtection);
  const protectedParts = zip.unzipSync(protectedBytes);
  const workbookXml = zip.strFromU8(protectedParts["xl/workbook.xml"]);
  assert.match(workbookXml, /<workbookProtection workbookPassword="ABCD" lockStructure="1" lockWindows="0"\/><bookViews>/);
  const protectedXml = zip.strFromU8(protectedParts["xl/worksheets/sheet2.xml"]);
  assert.match(zip.strFromU8(protectedParts["xl/styles.xml"]), /applyProtection="1"><protection locked="0"\/><\/xf>/);
  assert.match(protectedXml, /<\/sheetData><sheetProtection sheet="1" password="ABCD" formatCells="0"\/>/);
  const protectedWorkbook = importWorkbook(protectedBytes, zip, dom.window.DOMParser);
  assert.deepEqual(protectedWorkbook.protection, structureProtection);
  const reopenedProtection = protectedWorkbook.sheets;
  assert.deepEqual(reopenedProtection.map((sheet) => sheet.protection),
    [protectedSheets[0].protection, protectedSheets[1].protection, null]);
  assert.equal(reopenedProtection[1].cells.A1, "=1+2");
  assert.deepEqual(reopenedProtection[1].unlockedCells, { B1: true, C1: true });
  assert.equal(reopenedProtection[1].formats.B1, "number");
  const namedBytes = exportWorkbook(namedSheets, zip, false, namedRanges);
  const longSheet = { name: "Long", cells: { A9998: "7", A9999: "=A9998+3" } };
  const [reopenedLong] = importWorkbook(exportWorkbook([longSheet], zip), zip, dom.window.DOMParser).sheets;
  assert.equal(reopenedLong.rows, maxRows);
  assert.deepEqual(reopenedLong.cells, longSheet.cells);
  const namedFile = importWorkbook(namedBytes, zip, dom.window.DOMParser);
  assert.deepEqual(namedFile.namedRanges, namedRanges);
  assert.deepEqual(["A1", "A2", "A3"].map(calculateWorkbook(namedFile.sheets, 0, false, namedFile.namedRanges)), [20, 12, 8]);
  const textSheets = [{ name: "Text", cells: { A1: "  Case ", A2: '=UPPER(TRIM(A1))&" & notes"', A3: '="#REF!"', A4: "=missing!A1", A5: "=NOT(FALSE())" } }];
  const textBytes = exportWorkbook(textSheets, zip);
  const textXml = zip.strFromU8(zip.unzipSync(textBytes)["xl/worksheets/sheet1.xml"]);
  assert.match(textXml, /<c r="A2" t="str"><f>[^<]+<\/f><v>CASE &amp; notes<\/v><\/c>/);
  assert.match(textXml, /<c r="A3" t="str"><f>[^<]+<\/f><v>#REF!<\/v><\/c>/);
  assert.match(textXml, /<c r="A4" t="inlineStr">/);
  assert.match(textXml, /<c r="A5" t="b"><f>NOT\(FALSE\(\)\)<\/f><v>1<\/v><\/c>/);
  assert.deepEqual(importWorkbook(textBytes, zip, dom.window.DOMParser).sheets[0].cells, { ...textSheets[0].cells, A4: "'=missing!A1" });
  const lookupCells = { A1: "Bolt", B1: "8", C1: '=VLOOKUP("bolt",A1:B1,2,FALSE)', C2: '=VLOOKUP("nut",A1:B1,2,FALSE)' };
  const lookupBytes = exportWorkbook([{ name: "Inventory", cells: lookupCells }], zip);
  const lookupXml = zip.strFromU8(zip.unzipSync(lookupBytes)["xl/worksheets/sheet1.xml"]);
  assert.match(lookupXml, /<c r="C1"><f>[^<]+<\/f><v>8<\/v><\/c>/);
  assert.match(lookupXml, /<c r="C2" t="e"><f>[^<]+<\/f><v>#N\/A<\/v><\/c>/);
  assert.deepEqual(importWorkbook(lookupBytes, zip, dom.window.DOMParser).sheets[0].cells, lookupCells);
  const dateBytes = exportWorkbook(dateSheets, zip, true);
  const dateWorkbook = importWorkbook(dateBytes, zip, dom.window.DOMParser);
  assert.equal(dateWorkbook.date1904, true);
  assert.equal(dateWorkbook.sheets[0].formats.A1, "date");
  assert.equal(calculateWorkbook(dateWorkbook.sheets, 0, dateWorkbook.date1904)("A1"), 43889);
  const sheets = [{ name: "Sales & costs", cells: { A1: "10", A2: "20", A3: "=SUM(A1:A2)", B1: "001", B2: "'=literal" }, formats: { A3: "number", C1: "percent" } }, { name: "Notes", cells: { A1: 'Quotes and <symbols> "work"' }, formats: {} }];
  const validation = { C4: ["Ready", "On hold"], C5: ["Ready", "On hold"] };
  const filter = { range: "A1:B3", column: "A", value: "20" };
  const chart = parseChartRange("A1:B3");
  const conditionalRule = { range: "A1:A3", operator: "greaterThan", threshold: 10, color: "green" };
  const styles = { A3: { bold: true, italic: true, font: "Georgia", size: 14, align: "right", color: "2543A0", fill: "FFE5AA", border: true } };
  const print = { range: "A1:B3", paper: "letter", orientation: "landscape", grid: true, repeat: true };
  const bytes = exportWorkbook([{ ...sheets[0], freezeFirstRow: true, validation, filter, chart, conditionalRule, styles, print }, { ...sheets[1], hidden: true }], zip);
  const { sheets: imported } = importWorkbook(bytes, zip, dom.window.DOMParser);
  assert.deepEqual(imported.map(({ name, cells, formats }) => ({ name, cells, formats })), sheets);
  assert.equal(calculateSheet(imported[0].cells)("A3"), 30);
  assert.equal(imported[0].freezeFirstRow, true);
  assert.equal(imported[1].freezeFirstRow, false);
  assert.equal(imported[1].hidden, true);
  assert.deepEqual(imported[0].validation, validation);
  assert.deepEqual(imported[0].filter, filter);
  assert.deepEqual(imported[0].chart, chart);
  assert.deepEqual(imported[0].conditionalRule, conditionalRule);
  assert.deepEqual(imported[0].styles, styles);
  assert.deepEqual(imported[0].print, print);
  const { sheets: reopened } = importWorkbook(exportWorkbook(linked, zip), zip, dom.window.DOMParser);
  assert.equal(reopened[0].cells.A1, linked[0].cells.A1);
  assert.equal(calculateWorkbook(reopened, 0)("A1"), 14);
  const parts = zip.unzipSync(bytes);
  assert.match(zip.strFromU8(parts["xl/worksheets/sheet1.xml"]), /<f>SUM\(A1:A2\)<\/f><v>30<\/v>/);
  assert.match(zip.strFromU8(parts["xl/worksheets/sheet1.xml"]), /<row r="3" hidden="1">/);
  const worksheet = zip.strFromU8(parts["xl/worksheets/sheet1.xml"]);
  parts["xl/worksheets/sheet1.xml"] = zip.strToU8(worksheet.replace("<filters>", '<filters blank="0">'));
  assert.deepEqual(importWorkbook(zip.zipSync(parts), zip, dom.window.DOMParser).sheets[0].filter, filter);
  parts["xl/worksheets/sheet2.xml"] = zip.strToU8(zip.strFromU8(parts["xl/worksheets/sheet2.xml"]).replace('r="A1"', 'r="AA1"'));
  assert.throws(() => importWorkbook(zip.zipSync(parts), zip, dom.window.DOMParser), /26-column/);
} finally {
  dom.window.close();
}
console.log("Excel workbook round trip, formulas, and input bounds passed.");
