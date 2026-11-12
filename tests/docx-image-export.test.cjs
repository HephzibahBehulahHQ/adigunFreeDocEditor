const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

global.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = source.indexOf("  function wordXmlText(");
const end = source.indexOf("  async function exportDocx(", start);
assert.ok(start >= 0 && end > start, "DOCX serializer functions are present");

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S2sAAAAASUVORK5CYII=";
const src = `data:image/png;base64,${png}`;
const image = () => ({
  nodeType: 1, tagName: "IMG", children: [], childNodes: [], naturalWidth: 2, naturalHeight: 1,
  getAttribute(name) { return ({ src, alt: "Diagram & plan" })[name] || null; },
});
const paragraph = (child) => ({
  nodeType: 1, tagName: "P", children: [child], childNodes: [child], style: { textAlign: "" }, textContent: "",
  closest() { return null; },
});
const root = { children: [paragraph(image()), paragraph(image())] };
const page = { classList: { contains() { return false; } } };
const factory = new Function("Node", "editor", "title", "atob", "$", `${source.slice(start, end)}; return { makeWordPackage, makeStoredZip };`);
const { makeWordPackage, makeStoredZip } = factory(Node, root, () => "Image export QA", atob, () => page);
const result = makeWordPackage(root);
assert.deepEqual(result.unsupported, []);
const zipBlob = makeStoredZip(result.files);

zipBlob.arrayBuffer().then((arrayBuffer) => {
  const buffer = Buffer.from(arrayBuffer);
  const entries = new Map();
  const view = new DataView(arrayBuffer);
  let offset = 0;
  while (offset + 30 <= buffer.length && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.toString("utf8", nameStart, nameStart + nameLength);
    entries.set(name, buffer.subarray(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  assert.equal(entries.size, 9, "one deduplicated media part is included");
  assert.deepEqual(entries.get("word/media/image1.png"), Buffer.from(png, "base64"));
  const documentXml = entries.get("word/document.xml").toString("utf8");
  assert.equal((documentXml.match(/<wp:inline/g) || []).length, 2);
  assert.match(documentXml, /cx="19050" cy="9525"/);
  assert.match(documentXml, /Diagram &amp; plan/);
  assert.equal((entries.get("word/_rels/document.xml.rels").toString("utf8").match(/relationships\/image/g) || []).length, 1);
  assert.match(entries.get("[Content_Types].xml").toString("utf8"), /Extension="png" ContentType="image\/png"/);
  process.stdout.write("DOCX image export tests passed: binary PNG, deduplication, DrawingML, dimensions, alt text and content types.\n");
}).catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });

