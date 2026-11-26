import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const pages = ["index.html", "sheets.html", "slides.html", "pdf.html", "ai.html"];

test("Worker staging includes the shared footer loaded by every product page", async () => {
  const staging = await readFile(new URL("../scripts/stage-account-preview.mjs", import.meta.url), "utf8");
  assert.match(staging, /"company-footer\\.js"/);

  for (const page of pages) {
    const html = await readFile(new URL("../" + page, import.meta.url), "utf8");
    assert.match(html, /src="\\.\\/company-footer\\.js"/, `${page} loads the shared footer`);
  }

  const footer = await readFile(new URL("../company-footer.js", import.meta.url), "utf8");
  assert.match(footer, /assets\\/hb-official\\.jpg/);
  assert.match(footer, /mailto:isaacadigunoluwole@gmail\\.com/);
});
