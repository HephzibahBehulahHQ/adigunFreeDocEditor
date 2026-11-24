export function draftUrl(value) {
  const url = new URL(value);
  const local = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || url.username || url.password || url.search || url.hash) {
    throw new Error("Enter an HTTPS relay URL or a local loopback relay URL.");
  }
  return url;
}

function boundedText(value, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("The response did not contain a valid draft.");
  return value.trim();
}

export function validateDraft(kind, value) {
  if (!value || typeof value !== "object") throw new Error("The response did not contain a draft.");
  const title = boundedText(value.title, 100);
  if (kind === "document") return { title, content: boundedText(value.content, 8000) };
  if (kind !== "slides" || !Array.isArray(value.slides) || !value.slides.length || value.slides.length > 8) {
    throw new Error("Expected a draft with 1–8 slides.");
  }
  const slides = value.slides.map((slide) => ({
    title: boundedText(slide?.title, 120),
    content: boundedText(slide?.content, 1500),
  }));
  return { title, slides };
}

export function validateAssistantAnswer(value) {
  const answer = boundedText(value?.answer, 4_000);
  return { answer };
}
