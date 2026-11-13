const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const markup = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const start = source.indexOf("  function formatSavedTime(");
const end = source.indexOf("\n  function setSaveStatus(", start);
assert.ok(start >= 0 && end > start, "save-time formatter exists");
const formatSavedTime = new Function(source.slice(start, end) + "\nreturn formatSavedTime;")();

const earlyTimestamp = Date.UTC(2026, 0, 2, 3, 4);
const lateTimestamp = Date.UTC(2026, 0, 2, 13, 5);
const timeOptions = { hour: "2-digit", minute: "2-digit", hour12: false };
assert.equal(formatSavedTime(earlyTimestamp, "en-GB"), new Date(earlyTimestamp).toLocaleTimeString("en-GB", timeOptions));
assert.equal(formatSavedTime(lateTimestamp, "en-GB"), new Date(lateTimestamp).toLocaleTimeString("en-GB", timeOptions));
assert.match(formatSavedTime(earlyTimestamp, "en-GB"), /^\d{2}:\d{2}$/);
assert.equal(formatSavedTime(undefined, "en-GB"), "");
assert.equal(formatSavedTime("invalid", "en-GB"), "");
assert.match(markup, /id="save-label"/);
assert.match(markup, /<time id="save-time" class="save-time" hidden><\/time>/);
assert.match(source, /setSaveStatus\("Saved", false, updatedAt\)/);
assert.match(source, /setSaveStatus\("Saved", false, doc\.updatedAt\)/);
assert.match(css, /\.save-time\{color:#708094;font-size:10px;font-variant-numeric:tabular-nums\}/);

process.stdout.write("Save status tests passed: timestamps format consistently and persist on save and reopen.\n");
