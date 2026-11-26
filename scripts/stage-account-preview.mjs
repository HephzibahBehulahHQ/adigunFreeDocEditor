import { copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const output = new URL("../.wrangler/account-assets/", import.meta.url);
const pages = ["index.html", "sheets.html", "slides.html", "pdf.html", "ai.html"];
const assets = [
  ...pages, "styles.css", "app.js", "assistant-chat.js", "assistant-chat.css", "company-footer.js", "suite-preferences.js", "document-model.js", "editor-runtime.js",
  "sheets.js", "sheet-model.js", "sheet-xlsx.js", "sheet-chart-xlsx.js",
  "sheet-print.js", "sheet-pivot-xlsx.js", "sheet-notes-xlsx.js", "slides.js",
  "presentation-package.js", "ai-draft.js", "ai-draft-model.js", "pdf-workspace.js",
  "pdf-pages.js", "pdf-ocr.js", "pdf-redact.js", "pdf-render.js", "pdf-forms.js",
  "pdf-navigation.js", "pdf-comments.js", "pdf-organize.js", "pdf-text.js", "pdf-crop.js",
  "assets/hb-official.jpg",
  ...["pdf-lib.min.js", "PDF-LIB-LICENSE.md", "mammoth.browser.min.js",
    "MAMMOTH-LICENSE", "fflate.min.js", "FFLATE-LICENSE", "pdf.min.js",
    "pdf.worker.min.js", "PDFJS-LICENSE"].map((name) => "assets/vendor/" + name),
];

for (const asset of assets) {
  const target = new URL(asset, output);
  await mkdir(new URL(".", target), { recursive: true });
  await copyFile(new URL(asset, root), target);
}
await cp(new URL("assets/vendor/ocr/", root), new URL("assets/vendor/ocr/", output), { recursive: true });
for (const [source, target] of [
  ["node_modules/@tiptap/core/LICENSE.md", "TIPTAP-LICENSE.md"],
  ["node_modules/@tiptap/pm/LICENSE", "LICENSE"],
  ["node_modules/@tiptap/pm/THIRD_PARTY_LICENSES.md", "THIRD_PARTY_LICENSES.md"],
]) {
  await copyFile(new URL(source, root), new URL("assets/vendor/" + target, output));
}

for (const page of pages) {
  const target = new URL(page, output);
  const html = await readFile(target, "utf8");
  if (!html.includes("</head>") || !html.includes("</body>")) {
    throw new Error("Cannot attach account controls to " + page);
  }
  await writeFile(target, html
    .replace("</head>", '<link rel="stylesheet" href="./product-account-ui.css">\n<link rel="stylesheet" href="./assistant-chat.css">\n</head>')
    .replace("</body>", '<script type="module" src="./product-account-ui.mjs"></script>\n<script type="module" src="./assistant-chat.js"></script>\n</body>'));
}
for (const asset of ["product-account-ui.mjs", "product-account-ui.css"]) {
  await copyFile(new URL("cloudflare/" + asset, root), new URL(asset, output));
}
