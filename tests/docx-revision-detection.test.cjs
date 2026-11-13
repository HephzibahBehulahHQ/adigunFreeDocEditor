const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { deflateRawSync } = require("node:zlib");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const archiveStart = app.indexOf("  function inspectDocxArchive(");
const extractStart = app.indexOf("  async function readDocxRevisionCounts(", archiveStart);
const warningStart = app.indexOf("  function sourceRevisionLossWarning(", extractStart);
assert.ok(archiveStart >= 0 && extractStart > archiveStart && warningStart > extractStart);

const inspectSource = app.slice(archiveStart, extractStart);
const extractSource = app.slice(extractStart, warningStart);
class FakeXmlDocument {
  constructor(xml) { this.xml = xml; }
  getElementsByTagName(name) { return name === "parsererror" ? [] : []; }
  getElementsByTagNameNS(namespace, localName) {
    assert.equal(namespace, "http://schemas.openxmlformats.org/wordprocessingml/2006/main");
    const matches = this.xml.match(new RegExp(`<w:${localName}(?:\\s|>)`, "g"));
    return { length: matches?.length ?? 0 };
  }
}
class FakeDOMParser {
  parseFromString(xml) {
    if (!xml.startsWith("<?xml") && !xml.startsWith("<w:document")) throw new Error("unexpected XML input");
    return new FakeXmlDocument(xml);
  }
}

const api = new Function(
  "TextDecoder", "Uint8Array", "DataView", "DecompressionStream", "Blob", "Response", "DOMParser",
  `${inspectSource}\n${extractSource}\nreturn { inspectDocxArchive, readDocxRevisionCounts };`
)(TextDecoder, Uint8Array, DataView, DecompressionStream, Blob, Response, FakeDOMParser);

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
  const buffer = zip([
    ["[Content_Types].xml", "<Types/>"],
    ["word/document.xml", documentXml(body)],
  ], method);
  const entry = api.inspectDocxArchive(buffer);
  return api.readDocxRevisionCounts(buffer, entry);
}

(async () => {
  assert.deepEqual(await readCounts("<w:p><w:r><w:t>Plain text</w:t></w:r></w:p>", 0), { insertions: 0, deletions: 0 });
  assert.deepEqual(await readCounts("<w:p><w:ins w:id=\"1\"><w:r><w:t>new</w:t></w:r></w:ins><w:del w:id=\"2\"><w:r><w:delText>old</w:delText></w:r></w:del></w:p>", 8), { insertions: 1, deletions: 1 });
  process.stdout.write("DOCX revision detection tests passed: stored and deflated packages report namespaced insertion/deletion counts.\n");
})().catch((error) => { process.stderr.write(String(error.stack || error)); process.exitCode = 1; });
