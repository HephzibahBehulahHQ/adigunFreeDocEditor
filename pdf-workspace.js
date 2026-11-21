import { buildPdf } from "./pdf-pages.js";
import { bindPdfOcr } from "./pdf-ocr.js";
import { bindPdfRedaction } from "./pdf-redact.js";
import { bindPdfForms } from "./pdf-forms.js";
import { bindPdfNavigation } from "./pdf-navigation.js";

const $ = (id) => document.getElementById(id);
const sources = [];
bindPdfOcr(sources);
bindPdfRedaction(sources);
bindPdfForms(sources, showPreview);
const closeNavigation = bindPdfNavigation(sources, showPreview);
const preview = $("pdf-preview");
let previewUrl;
let busy = false;
const status = (message) => { $("pdf-status").textContent = message; };

function clearPreview() {
  preview.hidden = true;
  preview.removeAttribute("src");
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
}

function showPreview(file, page) {
  clearPreview();
  previewUrl = URL.createObjectURL(file);
  preview.title = "PDF preview: " + file.name;
  preview.src = page ? previewUrl + "#page=" + page : previewUrl;
  preview.hidden = false;
}

function button(label, handler, disabled = false) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "button button-outline";
  element.textContent = label;
  element.disabled = disabled || busy;
  element.addEventListener("click", handler);
  return element;
}

function render() {
  closeNavigation();
  $("pdf-navigation-toggle").disabled = busy || sources.length === 0;
  $("pdf-form-open").disabled = busy || sources.length === 0;
  $("pdf-redact").disabled = busy || sources.length === 0;
  $("pdf-ocr").disabled = busy || sources.length === 0;
  $("pdf-add").disabled = busy;
  $("pdf-export").disabled = busy || sources.length === 0;
  $("pdf-preview-output").disabled = busy || sources.length === 0;
  $("pdf-reset-pages").disabled = busy || sources.length === 0;
  $("pdf-source-list").replaceChildren(...sources.map((source, index) => {
    const item = document.createElement("li");
    item.className = "pdf-source";
    const title = document.createElement("strong");
    title.textContent = source.file.name + " · " + source.document.getPageCount() + " pages";
    const pages = document.createElement("label");
    pages.textContent = "Pages";
    const field = document.createElement("input");
    field.value = source.selection;
    field.placeholder = "All pages";
    field.maxLength = 800;
    field.disabled = busy;
    field.addEventListener("input", () => { source.selection = field.value; });
    pages.append(field);
    const rotations = document.createElement("label");
    rotations.textContent = "Rotation";
    const select = document.createElement("select");
    for (const [value, label] of [[0, "Original"], [90, "90° clockwise"], [180, "180°"], [270, "90° counterclockwise"]]) {
      select.add(new Option(label, value));
    }
    select.value = source.rotation;
    select.disabled = busy;
    select.addEventListener("change", () => { source.rotation = Number(select.value); });
    rotations.append(select);
    const actions = document.createElement("div");
    actions.className = "slides-actions";
    const move = (delta) => {
      const destination = index + delta;
      [sources[index], sources[destination]] = [sources[destination], sources[index]];
      render();
      $("pdf-source-list").children[destination].querySelector("button").focus();
    };
    actions.append(
      button("Preview", () => showPreview(source.file)),
      button("Up", () => move(-1), index === 0),
      button("Down", () => move(1), index === sources.length - 1),
      button("Remove", () => { sources.splice(index, 1); clearPreview(); render(); $("pdf-add").focus(); }),
    );
    item.append(title, pages, rotations, actions);
    return item;
  }));
}

$("pdf-add").addEventListener("click", () => $("pdf-files").click());
$("pdf-files").addEventListener("change", async (event) => {
  const files = [...event.target.files];
  event.target.value = "";
  if (busy || !files.length) return;
  busy = true;
  render();
  let added = 0;
  const rejected = [];
  for (const file of files) {
    if (sources.length >= 10 || sources.reduce((sum, item) => sum + item.file.size, file.size) > 40 * 1024 * 1024) {
      rejected.push("Keep up to 10 PDFs and 40 MB total.");
      break;
    }
    try {
      const document = await window.PDFLib.PDFDocument.load(await file.arrayBuffer());
      const count = document.getPageCount();
      if (!count || count > 200) throw new Error();
      sources.push({ file, document, selection: "", rotation: 0 });
      added++;
    } catch { rejected.push(`Could not open ${file.name}. Use an unencrypted PDF with up to 200 pages.`); }
  }
  busy = false;
  render();
  if (added && preview.hidden) showPreview(sources[0].file);
  status(rejected[0] || `${added} ${added === 1 ? "PDF" : "PDFs"} added`);
});

$("pdf-reset-pages").addEventListener("click", () => {
  for (const source of sources) { source.selection = ""; source.rotation = 0; }
  render();
  status("All source pages and original rotations restored.");
});

async function outputPages(show) {
  if (busy) return;
  busy = true;
  render();
  try {
    const bytes = await buildPdf(sources, window.PDFLib, {
      numberPages: $("pdf-page-numbers").checked,
      footer: $("pdf-footer-text").value.trim(),
    });
    if (show) {
      showPreview(new File([bytes], "Selected pages.pdf", { type: "application/pdf" }));
      status("Showing the selected pages");
      return;
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "adigun-selected-pages.pdf";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status("PDF exported");
  } catch (error) { status(error.message || "Could not export the selected pages."); }
  finally { busy = false; render(); $(show ? "pdf-preview-output" : "pdf-export").focus(); }
}
$("pdf-export").addEventListener("click", () => void outputPages(false));
$("pdf-preview-output").addEventListener("click", () => void outputPages(true));
render();
