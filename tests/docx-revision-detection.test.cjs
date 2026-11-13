const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { deflateRawSync } = require("node:zlib");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const archiveStart = app.indexOf("  function inspectDocxArchive(");
const extractStart = app.indexOf("  function readWordRevisionParagraphs(", archiveStart);
const warningStart = app.indexOf("  function sourceRevisionLossWarning(", extractStart);
assert.ok(archiveStart >= 0 && extractStart > archiveStart && warningStart > extractStart);

class FakeNode {
  constructor(nodeType, localName = "", attributes = {}, value = "") {
    this.nodeType = nodeType;
    this.localName = localName;
    this.namespaceURI = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    this.attributes = attributes;
    this.nodeValue = value;
    this.childNodes = [];
  }
  get textContent() { return this.nodeType === 3 ? this.nodeValue : this.childNodes.map((node) => node.textContent).join(""); }
  getAttributeNS(namespace, name) { return namespace === this.namespaceURI ? this.attributes[name] || "" : ""; }
}
function parseXml(xml) {
  const root = new FakeNode(1, "document");
  const stack = [root];
  const tokens = xml.match(/<[^>]+>|[^<]+/g) || [];
  for (const token of tokens) {
    if (token.startsWith("</")) { if (stack.length > 1) stack.pop(); continue; }
    if (token.startsWith("<?") || token.startsWith("<!")) continue;
    if (token.startsWith("<")) {
      const name = token.match(/^<w:([\w-]+)/)?.[1];
      if (!name) continue;
      const attrs = {};
      for (const match of token.matchAll(/w:([\w-]+)="([^"]*)"/g)) attrs[match[1]] = match[2];
      const node = new FakeNode(1, name, attrs);
      stack.at(-1).childNodes.push(node);
      if (!token.endsWith("/>")) stack.push(node);
    } else {
      const value = token.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
      stack.at(-1).childNodes.push(new FakeNode(3, "", {}, value));
    }
  }
  return root;
}
class FakeXmlDocument {
  constructor(root) { this.root = root; }
  getElementsByTagName(name) { return name === "parsererror" ? [] : []; }
  getElementsByTagNameNS(namespace, localName) {
    const matches = [];
    const visit = (node) => {
      if (node.nodeType === 1 && node.namespaceURI === namespace && node.localName === localName) matches.push(node);
      for (const child of node.childNodes) visit(child);
    };
    visit(this.root);
    return matches;
  }
}
class FakeDOMParser {
  parseFromString(xml) {
    if (!xml.startsWith("<?xml") && !xml.startsWith("<w:document")) throw new Error("unexpected XML input");
    return new FakeXmlDocument(parseXml(xml));
  }
}
const api = new Function(
  "TextDecoder", "Uint8Array", "DataView", "DecompressionStream", "Blob", "Response", "DOMParser", "Node",
  `${app.slice(archiveStart, warningStart)}\nreturn { inspectDocxArchive, readDocxRevisionCounts };`
)(TextDecoder, Uint8Array, DataView, DecompressionStream, Blob, Response, FakeDOMParser, { ELEMENT_NODE: 1 });

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function zip(entries, method) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const [name, value] of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const raw = Buffer.from(value, "utf8");
    const compressed = method === 8 ? deflateRawSync(raw) : raw;
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    localParts.push(local, nameBytes, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, nameBytes);
    localOffset += local.length + nameBytes.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  const packageBytes = Buffer.concat([...localParts, centralDirectory, end]);
  return packageBytes.buffer.slice(packageBytes.byteOffset, packageBytes.byteOffset + packageBytes.byteLength);
}
function documentXml(body) {
  return `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
}
async function readCounts(body, method) {
  const buffer = zip([["[Content_Types].xml", "<Types/>"], ["word/document.xml", documentXml(body)]], method);
  return api.readDocxRevisionCounts(buffer, api.inspectDocxArchive(buffer));
}

(async () => {
  assert.deepEqual(await readCounts("<w:p><w:r><w:t>Plain text</w:t></w:r></w:p>", 0), {
    insertions: 0, deletions: 0,
    paragraphs: [{ acceptedText: "Plain text", operations: [], unsupported: false }],
  });
  const revisions = await readCounts("<w:p><w:r><w:t>Start </w:t></w:r><w:ins w:id=\"1\" w:author=\"Alex\" w:date=\"2026-11-12T10:00:00Z\"><w:r><w:t>new</w:t></w:r></w:ins><w:del w:id=\"2\"><w:r><w:delText>old</w:delText></w:r></w:del></w:p>", 8);
  assert.equal(revisions.insertions, 1);
  assert.equal(revisions.deletions, 1);
  assert.equal(revisions.paragraphs[0].acceptedText, "Start new");
  assert.deepEqual(revisions.paragraphs[0].operations.map(({ kind, text, start, id, author }) => ({ kind, text, start, id, author })), [
    { kind: "insert", text: "new", start: 6, id: "1", author: "Alex" },
    { kind: "delete", text: "old", start: 9, id: "2", author: "", },
  ]);
  process.stdout.write("DOCX revision tests passed: stored and deflated packages preserve paragraph text, revision segments, offsets, and metadata.\n");
})().catch((error) => { process.stderr.write(String(error.stack || error)); process.exitCode = 1; });
