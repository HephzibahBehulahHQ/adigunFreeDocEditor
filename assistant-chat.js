const copy = {
  en: { open: "Open Adigun BOT", close: "Close Adigun BOT", title: "Adigun BOT", intro: "Ask about using FreeDocEditor. The assistant only receives the text you send here.", consent: "I agree to send this message to Adigun BOT for processing.", placeholder: "Type a question…", send: "Send", waiting: "Thinking…", failed: "Adigun BOT is unavailable right now. Try again shortly." },
  de: { open: "Adigun BOT öffnen", close: "Adigun BOT schließen", title: "Adigun BOT", intro: "Fragen zur Nutzung von FreeDocEditor. Der Assistent erhält nur den Text, den du hier sendest.", consent: "Ich stimme zu, diese Nachricht zur Verarbeitung an Adigun BOT zu senden.", placeholder: "Frage eingeben…", send: "Senden", waiting: "Denkt nach…", failed: "Adigun BOT ist derzeit nicht verfügbar. Bitte später erneut versuchen." },
  yo: { open: "Ṣí Adigun BOT", close: "Pa Adigun BOT", title: "Adigun BOT", intro: "Beere nipa lilo FreeDocEditor. Oluranlọwọ gba ọrọ ti o fi ranṣẹ nibi nikan.", consent: "Mo gba lati fi ifiranṣẹ yii ranṣẹ si Adigun BOT fun sisẹ.", placeholder: "Tẹ ibeere…", send: "Firanṣẹ", waiting: "N ronu…", failed: "Adigun BOT ko si lọwọlọwọ. Gbiyanju lẹẹkansi nigbamii." },
  pcm: { open: "Open Adigun BOT", close: "Close Adigun BOT", title: "Adigun BOT", intro: "Ask how to use FreeDocEditor. The assistant only receive the text wey you send here.", consent: "I agree make Adigun BOT process this message.", placeholder: "Type your question…", send: "Send", waiting: "E dey think…", failed: "Adigun BOT no dey available now. Try again shortly." },
};
const langKey = "freedoc-adigunbot-language";
let language = sessionStorage.getItem(langKey) || "en";
const t = () => copy[language] || copy.en;
const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) key === "text" ? node.textContent = value : node.setAttribute(key, value);
  for (const child of children) node.append(child);
  return node;
};

const launcher = el("button", { class: "fd-bot-launcher", type: "button", "aria-expanded": "false" });
const panel = el("section", { class: "fd-bot-panel", "aria-label": "Adigun BOT", hidden: "" });
const header = el("header", { class: "fd-bot-header" });
const title = el("strong", { text: t().title });
const languageSelect = el("select", { "aria-label": "Assistant language" });
for (const [value, label] of [["en", "English"], ["de", "Deutsch"], ["yo", "Yorùbá"], ["pcm", "Nigerian Pidgin"]]) languageSelect.add(new Option(label, value));
languageSelect.value = language;
const close = el("button", { type: "button", class: "fd-bot-close", "aria-label": "Close Adigun BOT", text: "×" });
header.append(title, languageSelect, close);
const intro = el("p", { class: "fd-bot-intro", text: t().intro });
const history = el("div", { class: "fd-bot-history", "aria-live": "polite" });
const status = el("p", { class: "fd-bot-status", role: "status", "aria-live": "polite" });
const form = el("form", { class: "fd-bot-form" });
const consentLabel = el("label", { class: "fd-bot-consent" });
const consent = el("input", { type: "checkbox", required: "" });
consentLabel.append(consent, document.createTextNode(" " + t().consent));
const question = el("textarea", { rows: "2", maxlength: "1500", required: "", placeholder: t().placeholder });
const send = el("button", { type: "submit", text: t().send });
form.append(consentLabel, question, send);
panel.append(header, intro, history, status, form);
document.body.append(launcher, panel);

function setLanguage(value) {
  language = copy[value] ? value : "en";
  sessionStorage.setItem(langKey, language);
  launcher.textContent = t().open;
  launcher.setAttribute("aria-label", t().open);
  close.setAttribute("aria-label", t().close);
  title.textContent = t().title; intro.textContent = t().intro;
  consentLabel.lastChild.textContent = " " + t().consent;
  question.placeholder = t().placeholder; send.textContent = t().send;
  languageSelect.value = language;
}
function toggle(open) {
  panel.hidden = !open;
  launcher.setAttribute("aria-expanded", String(open));
  launcher.setAttribute("aria-label", open ? t().close : t().open);
  if (open) question.focus(); else launcher.focus();
}
launcher.addEventListener("click", () => toggle(panel.hidden));
close.addEventListener("click", () => toggle(false));
panel.addEventListener("keydown", (event) => { if (event.key === "Escape") toggle(false); });
languageSelect.addEventListener("change", () => setLanguage(languageSelect.value));
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = question.value.trim();
  if (!text || !consent.checked) return;
  const userMessage = el("p", { class: "fd-bot-message fd-bot-user", text });
  history.append(userMessage);
  question.value = ""; send.disabled = true; status.textContent = t().waiting;
  const messages = [...history.querySelectorAll(".fd-bot-message")].slice(-8).map((node) => ({ role: node.classList.contains("fd-bot-user") ? "user" : "assistant", content: node.textContent }));
  try {
    const response = await fetch(new URL("/api/bot", location.origin), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages, consent: true, language }) });
    if (!response.ok) throw new Error("Adigun BOT request failed");
    const data = await response.json();
    if (typeof data.answer !== "string" || !data.answer.trim()) throw new Error("Invalid response");
    history.append(el("p", { class: "fd-bot-message fd-bot-reply", text: data.answer }));
    status.textContent = "";
  } catch {
    history.append(el("p", { class: "fd-bot-message fd-bot-reply", text: t().failed }));
    status.textContent = t().failed;
  } finally { consent.checked = false; send.disabled = false; history.scrollTop = history.scrollHeight; }
});
setLanguage(language);
