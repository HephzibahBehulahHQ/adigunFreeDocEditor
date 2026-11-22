import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const window = {};
const context = vm.createContext({ window, URL, Uint8Array, Uint16Array, Uint32Array, Int32Array, TextEncoder, TextDecoder });
for (const file of ["assets/vendor/fflate.min.js", "presentation-package.js"]) {
  vm.runInContext(fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"), context);
  if (file.endsWith("fflate.min.js")) window.fflate = context.fflate;
}
const parts = window.AdigunPresentation.createParts([
  { title: "First <slide>", lines: ["A & B", "Second line"], theme: "midnight", notes: "Private <notes>\nSpeaker & team" },
  { title: "Blank", lines: [], hidden: true, transition: { effect: "fade", duration: 1500, advance: 3000 },
    objects: [{ kind: "ellipse", x: 10, y: 20, width: 25, height: 18, rotation: 30, text: "Review", fill: "DAA9EF" }] },
]);
assert.match(window.fflate.strFromU8(parts["ppt/presentation.xml"]), /r:id="rId1".*r:id="rId2"/);
assert.match(window.fflate.strFromU8(parts["ppt/slides/slide1.xml"]), /First &lt;slide&gt;.*A &amp; B.*Second line/);
assert.match(window.fflate.strFromU8(parts["ppt/slides/slide1.xml"]), /<p:bg>.*srgbClr val="17213A".*srgbClr val="F3F5F9"/);
assert.match(window.fflate.strFromU8(parts["ppt/slides/slide2.xml"]), /name="Content".*<a:p>/);
assert.throws(() => window.AdigunPresentation.createParts(Array(81).fill({ title: "", lines: [] })), /limited to 80/);
const dom = new JSDOM();
try {
  const slides = window.AdigunPresentation.importTextSlides(window.fflate.zipSync(parts), dom.window.DOMParser);
  assert.deepEqual(JSON.parse(JSON.stringify(slides)), [
    { title: "First <slide>", content: "A & B\nSecond line", notes: "Private <notes>\nSpeaker & team" },
    { title: "Blank", content: "", hidden: true, transition: { effect: "fade", duration: 1500, advance: 3000 },
      objects: [{ kind: "ellipse", x: 10, y: 20, width: 25, height: 18, rotation: 30, text: "Review", fill: "DAA9EF" }] },
  ]);
  const grouped = [
    { kind: "rectangle", x: 15, y: 12, width: 20, height: 12, text: "First", group: 2, link: "https://example.com/?a=1&b=2" },
    { kind: "text", x: 45, y: 40, width: 20, height: 12, text: "Outside" },
    { kind: "ellipse", x: 52, y: 13, width: 16, height: 14, rotation: 30, text: "Second", group: 2 },
  ];
  const groupedParts = window.AdigunPresentation.createParts([{ title: "Group test", lines: [], objects: grouped }]);
  const xml = window.fflate.strFromU8(groupedParts["ppt/slides/slide1.xml"]);
  assert.match(xml, /<p:grpSp><p:nvGrpSpPr><p:cNvPr id="31" name="Adigun group"/);
  assert.match(xml, /<a:hlinkClick r:id="rIdLink1"\/>/);
  assert.match(window.fflate.strFromU8(groupedParts["ppt/slides/_rels/slide1.xml.rels"]), /Target="https:\/\/example.com\/\?a=1&amp;b=2" TargetMode="External"/);
  const [reopened] = window.AdigunPresentation.importTextSlides(window.fflate.zipSync(groupedParts), dom.window.DOMParser);
  assert.deepEqual(Array.from(reopened.objects, ({ text, x, group }) => [text, x, group]),
    [["Outside", 45, undefined], ["First", 15, 1], ["Second", 52, 1]]);
  assert.equal(reopened.objects[1].link, grouped[0].link);
  for (const unsafe of ["javascript:alert(1)", "file:///secret", "https://user:secret@example.com"]) {
    assert.equal(window.AdigunPresentation.normalizeObjectLink(unsafe), "");
  }
  groupedParts["ppt/slides/slide1.xml"] = window.fflate.strToU8(xml.replace(
    '<a:off x="1828800" y="822960"/><a:ext', '<a:off x="2438400" y="822960"/><a:ext',
  ));
  const [moved] = window.AdigunPresentation.importTextSlides(window.fflate.zipSync(groupedParts), dom.window.DOMParser);
  assert.deepEqual(Array.from(moved.objects, ({ x }) => x), [45, 20, 57]);
  const animations = [
    { effect: "pulse", target: "content", start: "auto", duration: 1.4, delay: 0.2 },
    { effect: "fade", target: "both", start: "auto", duration: 0.65, delay: 0.25 },
    { effect: "exit", target: "object:0", start: "auto", duration: 1.4, delay: 0.3 },
    { effect: "fade", target: "object:2", start: "manual", duration: 0.8, delay: 1.2 },
    { effect: "rise", target: "title", start: "manual", duration: 0.5, delay: 0 },
    { effect: "drift", target: "both", start: "manual", duration: 2, delay: 0.4 },
  ];
  const animatedParts = window.AdigunPresentation.createParts([{ title: "Sequence", lines: ["Details"], objects: grouped, animations }]);
  const animated = new dom.window.DOMParser().parseFromString(window.fflate.strFromU8(animatedParts["ppt/slides/slide1.xml"]), "application/xml");
  const ids = [...animated.getElementsByTagNameNS("*", "cTn")].map((part) => part.getAttribute("id"));
  assert.equal(ids.length, new Set(ids).size);
  assert.deepEqual([...animated.getElementsByTagNameNS("*", "animEffect")].map((node) => [
    node.getAttribute("transition"), node.getElementsByTagNameNS("*", "spTgt")[0].getAttribute("spid"),
  ]), [["in", "2"], ["in", "3"], ["out", "4"], ["in", "6"]]);
  const [rise] = animated.getElementsByTagNameNS("*", "anim");
  assert.equal(rise.getElementsByTagNameNS("*", "spTgt")[0].getAttribute("spid"), "2");
  assert.equal(rise.parentElement.parentElement.getAttribute("presetSubtype"), "4");
  assert.deepEqual([...rise.getElementsByTagNameNS("*", "strVal")].map((node) => node.getAttribute("val")),
    ["1+#ppt_h/2", "#ppt_y"]);
  const [pulse] = animated.getElementsByTagNameNS("*", "animScale");
  const [pulseTime] = pulse.getElementsByTagNameNS("*", "cTn");
  const [scaleBy] = pulse.getElementsByTagNameNS("*", "by");
  assert.equal(pulse.parentElement.parentElement.getAttribute("presetClass"), "emph");
  assert.equal(pulseTime.getAttribute("dur"), "700");
  assert.equal(pulseTime.getAttribute("autoRev"), "1");
  assert.deepEqual([scaleBy.getAttribute("x"), scaleBy.getAttribute("y")], ["104000", "104000"]);
  const paths = [...animated.getElementsByTagNameNS("*", "animMotion")];
  assert.deepEqual(paths.map((path) => path.getAttribute("path")), ["M 0 0 L 0.025 0 L 0 0 E", "M 0 0 L 0.025 0 L 0 0 E"]);
  assert.deepEqual(paths.map((path) => path.getElementsByTagNameNS("*", "spTgt")[0].getAttribute("spid")), ["2", "3"]);
  const [animatedSlide] = window.AdigunPresentation.importTextSlides(window.fflate.zipSync(animatedParts), dom.window.DOMParser);
  assert.deepEqual(JSON.parse(JSON.stringify(animatedSlide.animations)), [
    animations[0], animations[1], { ...animations[2], target: "object:1" }, animations[3], animations[4], animations[5],
  ]);
  const tableCells = [["Product", "Units"], ["B & C", "3"], ["D", ""]];
  const tableParts = window.AdigunPresentation.createParts([{ title: "Table", lines: [], objects: [
    { kind: "table", width: 48, height: 30, cells: tableCells },
  ] }]);
  const tableXml = window.fflate.strFromU8(tableParts["ppt/slides/slide1.xml"]);
  assert.match(tableXml, /<p:graphicFrame>.*<a:tbl><a:tblPr\/><a:tblGrid>/);
  const [tableSlide] = window.AdigunPresentation.importTextSlides(window.fflate.zipSync(tableParts), dom.window.DOMParser);
  assert.deepEqual(JSON.parse(JSON.stringify(tableSlide.objects[0].cells)), tableCells);
  assert.equal(tableSlide.objects[0].fill, "D9D1FC");
  const chartCells = [["North & West", "12"], ["South", "-4"], ["East", ""]];
  const chartParts = window.AdigunPresentation.createParts([{ title: "Chart", lines: [], objects: [
    { kind: "chart", cells: chartCells },
  ] }]);
  const chart = window.fflate.strFromU8(chartParts["ppt/charts/slide1-chart1.xml"]);
  assert.match(chart, /<c:barDir val="col"\/>/);
  assert.match(chart, /<c:externalData r:id="rId1">/);
  assert.ok(chartParts["ppt/embeddings/slide1-chart1.xlsx"]);
  const [chartSlide] = window.AdigunPresentation.importTextSlides(window.fflate.zipSync(chartParts), dom.window.DOMParser);
  assert.deepEqual(JSON.parse(JSON.stringify(chartSlide.objects[0].cells)), chartCells);
} finally {
  dom.window.close();
}
console.log("Presentation package preserves slide order and text, including blank slides.");
