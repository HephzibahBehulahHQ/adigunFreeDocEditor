const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const appStart = html.indexOf('<main class="app-shell">');
const appEnd = html.indexOf("</main>", appStart);
assert.ok(appStart >= 0 && appEnd > appStart, "application shell is present");
assert.match(html.slice(appStart, appEnd), /<section class="adigun-window hidden" id="adigun-window"/);
assert.doesNotMatch(html.slice(appEnd), /id="adigun-window"/, "the panel remains part of the app grid");
assert.match(source, /window\.matchMedia\("\(min-width: 1200px\)"\)/);
assert.match(source, /appShell\.classList\.toggle\("assistant-docked", docked\)/);
assert.match(source, /assistant\.classList\.toggle\("docked", docked\)/);
assert.match(source, /window\.addEventListener\("resize", updateAssistantLayout\)/);
assert.match(css, /@media\(min-width:1200px\)\{\.app-shell\.assistant-docked\{grid-template-columns:240px minmax\(0,1fr\) 310px\}/);
assert.match(css, /\.app-shell\.assistant-docked>\.adigun-window\{position:sticky;grid-column:3;grid-row:1/);

process.stdout.write("Assistant layout tests passed: the local tools dock at wide widths and remain in the responsive shell.\n");

