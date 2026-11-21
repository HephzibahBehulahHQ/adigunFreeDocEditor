import { draftUrl, validateDraft } from "./ai-draft-model.js";

const $ = (id) => document.getElementById(id);
const form = $("ai-draft-form");
const status = (message) => { $("ai-status").textContent = message; };
let result;
if (new URLSearchParams(location.search).get("kind") === "slides") $("ai-kind").value = "slides";

function showDraft(kind, draft) {
  const heading = document.createElement("h3");
  heading.textContent = draft.title;
  const preview = $("ai-result");
  preview.replaceChildren(heading);
  if (kind === "slides") {
    const slides = document.createElement("ol");
    for (const slide of draft.slides) {
      const item = document.createElement("li");
      const title = document.createElement("h4");
      title.textContent = slide.title;
      const body = document.createElement("p");
      body.textContent = slide.content;
      item.append(title, body);
      slides.append(item);
    }
    preview.append(slides);
  } else {
    const body = document.createElement("p");
    body.textContent = draft.content;
    preview.append(body);
  }
  $("ai-download").textContent = kind === "slides" ? "Download PowerPoint" : "Download text";
  $("ai-download").hidden = false;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("ai-generate");
  if (button.disabled || !$("ai-consent").checked) return;
  const kind = $("ai-kind").value;
  const prompt = $("ai-prompt").value.trim();
  if (!prompt) { status("Enter a prompt to generate a draft."); return; }
  button.disabled = true;
  $("ai-consent").checked = false;
  status("Waiting for the configured relay…");
  try {
    const relay = draftUrl($("ai-relay").value.trim());
    const response = await fetch(relay, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + $("ai-token").value },
      body: JSON.stringify({ kind, prompt, consent: true }),
      redirect: "error",
      credentials: "omit",
      signal: AbortSignal.timeout(40_000),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "The relay rejected the request.");
    const draft = validateDraft(kind, payload.draft);
    result = { kind, draft };
    showDraft(kind, draft);
    status("Draft ready for review");
  } catch (error) {
    status(error instanceof TypeError ? "Could not reach the private relay. Check its URL and browser permissions." : error.message);
  } finally { button.disabled = false; }
});

$("ai-download").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  if (!result || button.disabled) return;
  button.disabled = true;
  try {
    const { kind, draft } = result;
    const isDeck = kind === "slides";
    const blob = isDeck
      ? await window.AdigunPresentation.createBlob(draft.slides.map((slide) => ({ title: slide.title, lines: slide.content.split("\n") })))
      : new Blob([draft.title + "\n\n" + draft.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = (draft.title.replace(/[\\/:*?"<>|]/g, "-") || "Adigun draft") + (isDeck ? ".pptx" : ".txt");
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    status("The draft could not be downloaded.");
  } finally { button.disabled = false; }
});
