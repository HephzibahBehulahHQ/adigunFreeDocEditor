const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
assert.match(app, /Create a document or open a supported file to get started\./);
assert.doesNotMatch(app, /this first workspace/, "landing copy should not describe the product as an in-development slice");
process.stdout.write("Landing copy tests passed: entry screen uses concise, user-facing wording.\\n");
