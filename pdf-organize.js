import { buildPdf, flattenPdfForm, sourcePages } from "./pdf-pages.js";

export function bindPdfOrganizer(sources, onSave) {
  const dialog = document.querySelector("#pdf-organize-dialog");
  const list = dialog.querySelector("ol");
  const sourcePicker = dialog.querySelector("select");
  const notice = dialog.querySelector("[role=status]");
  const apply = dialog.querySelector("[data-apply]");
  const undo = dialog.querySelector("[data-undo]");
  const download = dialog.querySelector("[data-extract]");
  const close = dialog.querySelector("[data-close]");
  const flatten = dialog.querySelector("[data-flatten]");
  let plan = [];
  let history = [];
  let activeSource;
  let busy = false;

  function change(update, focus) {
    history.push(plan.map((entry) => ({ ...entry })));
    if (history.length > 30) history.shift();
    update();
    render();
    list.children[focus]?.querySelector("button:not(:disabled)")?.focus();
  }

  function updateActions() {
    apply.disabled = busy || !plan.length;
    undo.disabled = busy || !history.length;
    download.disabled = busy || !plan.some((entry) => entry.selected);
    close.disabled = sourcePicker.disabled = busy;
    flatten.disabled = busy;
  }

  function render() {
    const hasRoom = plan.length < 200;
    list.replaceChildren(...plan.map((entry, index) => {
      const item = document.createElement("li");
      const select = document.createElement("input");
      select.type = "checkbox";
      select.disabled = busy;
      select.checked = entry.selected;
      select.setAttribute("aria-label", `Select output page ${index + 1} for extraction`);
      select.addEventListener("change", () => { entry.selected = select.checked; updateActions(); });
      const title = document.createElement("span");
      title.textContent = `Output ${index + 1} · Source ${entry.index + 1}${entry.rotation ? ` · +${entry.rotation}°` : ""}`;
      const actions = document.createElement("div");
      actions.className = "slides-actions";
      function command(label, update, disabled, focus) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button button-outline";
        button.textContent = label;
        button.disabled = busy || disabled;
        button.setAttribute("aria-label", `${label}, output page ${index + 1}`);
        button.addEventListener("click", () => change(update, focus));
        return button;
      }
      const move = (target) => {
        [plan[index], plan[target]] = [plan[target], plan[index]];
      };
      actions.append(
        command("Up", () => move(index - 1), index === 0, index - 1),
        command("Down", () => move(index + 1), index + 1 === plan.length, index + 1),
        command("Rotate +90°", () => { entry.rotation = (entry.rotation + 90) % 360; }, false, index),
        command("Duplicate", () => plan.splice(index + 1, 0, { ...entry, selected: false }), !hasRoom, index + 1),
        command("Remove", () => plan.splice(index, 1), plan.length === 1, Math.min(index, plan.length - 2)),
      );
      item.append(select, title, actions);
      return item;
    }));
    updateActions();
  }

  function load() {
    activeSource = sourcePicker.value;
    history = [];
    plan = [];
    flatten.checked = false;
    try {
      plan = sourcePages(sources[activeSource]).map((entry) => ({ ...entry, selected: false }));
      notice.textContent = "Arrange the output pages or select pages for a separate extract.";
    } catch (error) { notice.textContent = error.message; }
    render();
  }

  const discard = () => !history.length || window.confirm("Discard the unsaved page arrangement?");
  document.querySelector("#pdf-organize").addEventListener("click", () => {
    sourcePicker.replaceChildren(...sources.map((item, index) => new Option(item.file.name, index)));
    load();
    dialog.showModal();
  });
  sourcePicker.addEventListener("change", () => {
    if (discard()) load();
    else sourcePicker.value = activeSource;
  });
  undo.addEventListener("click", () => { plan = history.pop(); render(); });
  apply.addEventListener("click", () => {
    sources[activeSource].plan = plan.map(({ index, rotation }) => ({ index, rotation }));
    history = [];
    dialog.close();
    onSave();
  });
  close.addEventListener("click", () => { if (!busy && discard()) dialog.close(); });
  dialog.addEventListener("cancel", (event) => { if (busy || !discard()) event.preventDefault(); });
  download.addEventListener("click", async () => {
    if (busy || !plan.some((entry) => entry.selected)) return;
    busy = true;
    render();
    try {
      const item = sources[activeSource];
      const lib = window.PDFLib;
      const document = flatten.checked ? await flattenPdfForm(item, lib) : item.document;
      const bytes = await buildPdf([{ ...item, document, plan: plan.filter((entry) => entry.selected) }], lib);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = item.file.name.replace(/\.pdf$/i, "") + "-extract.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notice.textContent = "Selected pages downloaded as a separate PDF.";
    } catch (error) { notice.textContent = error.message || "Could not extract the selected pages."; }
    finally { busy = false; render(); }
  });
}
