const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const sidebarWidth = Number(css.match(/\.app-shell\{[^}]*grid-template-columns:(\d+)px minmax/)?.[1]);
const conversionPadding = Number(css.match(/\.conversion-workspace\{[^}]*padding:\d+px (\d+)px/)?.[1]);
const grid = css.match(/\.conversion-grid\{[^}]*grid-template-columns:minmax\((\d+)px,[^)]*\) minmax\((\d+)px,[^)]*\);gap:(\d+)px/);
const breakpoint = Number(css.match(/@media\(max-width:(\d+)px\)\{\.conversion-grid\{grid-template-columns:1fr\}/)?.[1]);

assert.ok(Number.isFinite(sidebarWidth), "desktop navigation width is declared");
assert.ok(Number.isFinite(conversionPadding), "conversion workspace horizontal padding is declared");
assert.ok(grid, "conversion cards declare minimum widths and a gap");
assert.ok(Number.isFinite(breakpoint), "conversion layout has a responsive collapse breakpoint");

const minimumGridWidth = Number(grid[1]) + Number(grid[2]) + Number(grid[3]);
const minimumDesktopViewport = sidebarWidth + conversionPadding * 2 + minimumGridWidth;
assert.ok(
  breakpoint >= minimumDesktopViewport,
  "conversion cards stack before the desktop workspace becomes narrower than their minimum widths",
);
process.stdout.write("Conversion layout tests passed: the two-card layout stacks before its minimum desktop width.\n");
