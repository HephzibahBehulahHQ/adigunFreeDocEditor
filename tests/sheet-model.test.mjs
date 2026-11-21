import assert from "node:assert/strict";
import { calculateSheet, cellAddress, parseCsv, toCsv } from "../sheet-model.js";

assert.equal(cellAddress(99, 25), "Z100");
assert.deepEqual(parseCsv('name,value\r\n"one, two","a ""quote"""\r\n"line\nbreak",5'), [
  ["name", "value"], ["one, two", 'a "quote"'], ["line\nbreak", "5"],
]);
assert.throws(() => parseCsv('"never closed'), /unclosed/);
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
assert.deepEqual(parseCsv(toCsv({ A1: "2", B1: "=A1*3", A2: 'a,"b"', B2: "@external" })), [["2", "6"], ['a,"b"', "'@external"]]);
console.log("Sheets calculations, CSV quoting, and input limits passed.");
