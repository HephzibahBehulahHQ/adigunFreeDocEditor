import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const window = {};
const context = vm.createContext({ window, Uint8Array, Uint16Array, Uint32Array, Int32Array, TextEncoder, TextDecoder });
for (const file of ["assets/vendor/fflate.min.js", "presentation-package.js"]) {
  vm.runInContext(fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"), context);
  if (file.endsWith("fflate.min.js")) window.fflate = context.fflate;
}
const parts = window.AdigunPresentation.createParts([
  { title: "First <slide>", lines: ["A & B", "Second line"] },
  { title: "Blank", lines: [] },
]);
assert.match(window.fflate.strFromU8(parts["ppt/presentation.xml"]), /r:id="rId1".*r:id="rId2"/);
assert.match(window.fflate.strFromU8(parts["ppt/slides/slide1.xml"]), /First &lt;slide&gt;.*A &amp; B.*Second line/);
assert.match(window.fflate.strFromU8(parts["ppt/slides/slide2.xml"]), /name="Content".*<a:p>/);
assert.throws(() => window.AdigunPresentation.createParts(Array(81).fill({ title: "", lines: [] })), /limited to 80/);
console.log("Presentation package preserves slide order and text, including blank slides.");
