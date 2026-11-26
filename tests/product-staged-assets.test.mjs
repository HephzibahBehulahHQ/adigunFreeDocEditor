import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const pages = ["index.html", "sheets.html", "slides.html", "pdf.html", "ai.html"];

test("Worker staging includes the shared footer loaded by every product page", async () => {
  const staging = await readFile(new URL("../scripts/stage-account-preview.mjs", import.meta.url), "utf8");
  assert.ok(staging.includes('"company-footer.js"'));

  for (const page of pages) {
    const html = await readFile(new URL("../" + page, import.meta.url), "utf8");
    assert.ok(html.includes('src="./company-footer.js"'), `${page} loads the shared footer`);
  }

  const footer = await readFile(new URL("../company-footer.js", import.meta.url), "utf8");
  assert.ok(footer.includes("./assets/hb-official.jpg"));
  assert.ok(footer.includes("mailto:isaacadigunoluwole@gmail.com"));
});


test("suite preferences sync the theme with the Docs workspace across pages", async () => {
  const { JSDOM } = await import("jsdom");
  const staging = await readFile(new URL("../scripts/stage-account-preview.mjs", import.meta.url), "utf8");
  assert.ok(staging.includes('"suite-preferences.js"'));
  for (const page of ["sheets.html", "slides.html", "pdf.html", "ai.html"]) {
    const html = await readFile(new URL("../" + page, import.meta.url), "utf8");
    assert.match(html, /suite-preferences\.js/);
    assert.match(html, /suite-theme-toggle/);
    assert.match(html, /class="suite-page/);
  }
  const dom = new JSDOM('<meta name="theme-color" content="#0b1220"><button id="suite-theme-toggle"></button>', { url: "https://example.test/", runScripts: "outside-only" });
  const source = await readFile(new URL("../suite-preferences.js", import.meta.url), "utf8");
  dom.window.eval(source);
  const button = dom.window.document.querySelector("#suite-theme-toggle");
  button.click();
  assert.equal(dom.window.document.documentElement.dataset.theme, "dark");
  assert.equal(dom.window.localStorage.getItem("adigun-theme"), "dark");
  assert.equal(button.getAttribute("aria-pressed"), "true");
  dom.window.dispatchEvent(new dom.window.StorageEvent("storage", { key: "adigun-theme", newValue: "light" }));
  assert.equal(dom.window.document.documentElement.dataset.theme, "light");
});
