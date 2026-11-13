const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const lightMuted = css.match(/:root\{[^}]*--muted:(#[0-9a-f]{6})/i)?.[1];
const darkMuted = css.match(/data-theme="dark"\]\{[^}]*--muted:(#[0-9a-f]{6})/i)?.[1];
assert.equal(lightMuted, "#5b6676");
assert.equal(darkMuted, "#a8b3c4");

function luminance(hex) {
  const values = hex.slice(1).match(/.{2}/g).map((channel) => parseInt(channel, 16) / 255);
  const rgb = values.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

for (const surface of ["#ffffff", "#f3f5f9"]) {
  assert.ok(contrast(lightMuted, surface) >= 4.5, "light muted text meets 4.5:1 on " + surface);
}
for (const surface of ["#151d2b", "#0e1623"]) {
  assert.ok(contrast(darkMuted, surface) >= 4.5, "dark muted text meets 4.5:1 on " + surface);
}
assert.match(css, /\.save-state\{[^}]*color:var\(--muted\)/);
assert.match(css, /\.save-time\{color:var\(--muted\)/);
assert.doesNotMatch(css, /color:#(?:718096|708094)\b/i, "muted labels use the theme-aware contrast token");

process.stdout.write("Text contrast tests passed: muted labels meet 4.5:1 in both themes.\n");

