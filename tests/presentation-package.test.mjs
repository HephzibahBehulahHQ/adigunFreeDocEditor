import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const window = {};
const context = vm.createContext({ window, Uint8Array, Uint16Array, Uint32Array, Int32Array, TextEncoder, TextDecoder });
for (const file of ["assets/vendor/fflate.min.js", "presentation-package.js"]) {
  vm.runInContext(fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"), context);
  if (file.endsWith("fflate.min.js")) window.fflate = context.fflate;
}
const parts = window.AdigunPresentation.createParts([
  { title: "First <slide>", lines: ["A & B", "Second line"], theme: "midnight" },
  { title: "Blank", lines: [], hidden: true },
]);
assert.match(window.fflate.strFromU8(parts["ppt/presentation.xml"]), /r:id="rId1".*r:id="rId2"/);
assert.match(window.fflate.strFromU8(parts["ppt/slides/slide1.xml"]), /First &lt;slide&gt;.*A &amp; B.*Second line/);
assert.match(window.fflate.strFromU8(parts["ppt/slides/slide1.xml"]), /<p:bg>.*srgbClr val="17213A".*srgbClr val="F3F5F9"/);
assert.match(window.fflate.strFromU8(parts["ppt/slides/slide2.xml"]), /name="Content".*<a:p>/);
assert.throws(() => window.AdigunPresentation.createParts(Array(81).fill({ title: "", lines: [] })), /limited to 80/);
const dom = new JSDOM();
try {
  const slides = window.AdigunPresentation.importTextSlides(window.fflate.zipSync(parts), dom.window.DOMParser);
  assert.deepEqual(JSON.parse(JSON.stringify(slides)), [{ title: "First <slide>", content: "A & B\nSecond line" }, { title: "Blank", content: "", hidden: true }]);
} finally {
  dom.window.close();
}
console.log("Presentation package preserves slide order and text, including blank slides.");
