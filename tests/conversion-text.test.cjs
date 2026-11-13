const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = source.indexOf("  function conversionHTMLFromText(");
const end = source.indexOf("  async function runConversion(", start);
assert.ok(start >= 0 && end > start, "plain text conversion helper is present");
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);
const conversionHTMLFromText = new Function("escapeHTML", source.slice(start, end) + "\nreturn conversionHTMLFromText;")(escapeHTML);

assert.equal(conversionHTMLFromText("Alpha\r\nBeta & <tag>"), "<p>Alpha</p><p>Beta &amp; &lt;tag&gt;</p>");
assert.equal(conversionHTMLFromText(""), "<p><br></p>");
assert.equal(conversionHTMLFromText("<script>"), "<p>&lt;script&gt;</p>");
process.stdout.write("Conversion text tests passed: line breaks and HTML escaping.\n");
