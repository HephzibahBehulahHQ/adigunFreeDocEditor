import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { draftUrl, validateDraft } from "../ai-draft-model.js";

async function readJson(stream, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > limit) throw new Error("Request or response is too large.");
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createRelay({ origin, upstream, model, accessToken, providerKey, limitPerMinute = 6, fetchProvider = fetch }) {
  if (!origin || !model || !accessToken || accessToken.length < 20) {
    throw new Error("Configure the allowed site origin, model name, and a relay access token of at least 20 characters.");
  }
  const allowedOrigin = draftUrl(origin).origin;
  const providerUrl = draftUrl(upstream);
  const expected = Buffer.from("Bearer " + accessToken);
  const requests = [];
  let running = false;
  return createServer({ requestTimeout: 12_000 }, async (request, response) => {
    const send = (code, data) => {
      response.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify(data));
    };
    if (request.url !== "/draft") { send(404, { error: "Unknown relay route." }); return; }
    if (request.headers.origin !== allowedOrigin) { send(403, { error: "This site is not allowed." }); return; }
    response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    response.setHeader("Vary", "Origin");
    if (request.method === "OPTIONS") {
      response.setHeader("Access-Control-Allow-Methods", "POST");
      response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      if (request.headers["access-control-request-private-network"] === "true") response.setHeader("Access-Control-Allow-Private-Network", "true");
      response.writeHead(204).end();
      return;
    }
    if (request.method !== "POST") { send(405, { error: "Use POST to request a draft." }); return; }
    const authorization = Buffer.from(request.headers.authorization || "");
    if (authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) {
      send(401, { error: "The relay token is invalid." });
      return;
    }
    const now = Date.now();
    while (requests.length && now - requests[0] >= 60_000) requests.shift();
    if (running || requests.length >= limitPerMinute) { send(429, { error: "The relay is busy. Try again shortly." }); return; }
    running = true;
    requests.push(now);
    try {
      let input;
      try { input = await readJson(request, 12_000); }
      catch { send(400, { error: "The draft request is invalid or too large." }); return; }
      if (!["document", "slides"].includes(input?.kind) || typeof input.prompt !== "string" || !input.prompt.trim() || input.prompt.length > 2000 || input.consent !== true) {
        send(400, { error: "Provide an approved document or slide prompt of up to 2,000 characters." });
        return;
      }
      const system = input.kind === "slides"
        ? 'Draft a concise presentation from the user request. Return JSON only in the form {"title":"…","slides":[{"title":"…","content":"…"}]}. Use 1–8 slides, titles up to 100 characters, and body text up to 1,500 characters per slide.'
        : 'Draft a useful editable document from the user request. Return JSON only in the form {"title":"…","content":"…"}. Use a title up to 100 characters and content up to 8,000 characters.';
      const upstreamResponse = await fetchProvider(providerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(providerKey ? { Authorization: "Bearer " + providerKey } : {}) },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: system }, { role: "user", content: input.prompt.trim() }],
          max_completion_tokens: 3200,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(35_000),
      });
      if (!upstreamResponse.ok) throw new Error("Provider rejected the request.");
      const result = await readJson(upstreamResponse.body, 100_000);
      const draft = validateDraft(input.kind, JSON.parse(result.choices[0].message.content));
      send(200, { draft });
    } catch {
      send(502, { error: "The configured provider did not return a valid draft." });
    } finally {
      running = false;
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createRelay({
    origin: process.env.ADIGUN_AI_ORIGIN || "https://adigunfreedoceditor.hephzibahbehulah.com",
    upstream: process.env.ADIGUN_AI_UPSTREAM,
    model: process.env.ADIGUN_AI_MODEL,
    accessToken: process.env.ADIGUN_AI_ACCESS_TOKEN,
    providerKey: process.env.ADIGUN_AI_PROVIDER_KEY,
  });
  const port = Number(process.env.ADIGUN_AI_PORT || 8787);
  server.listen(port, "127.0.0.1", () => console.log(`Adigun AI relay listening on http://127.0.0.1:${port}/draft`));
}
