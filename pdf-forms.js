function editableFields(document, lib) {
  if (document.catalog.getAcroForm()?.dict.has(lib.PDFName.of("XFA"))) {
    throw new Error("This PDF uses an XFA form. Open an AcroForm PDF to fill fields here.");
  }
  const form = document.getForm();
  const fields = form.getFields();
  if (document.catalog.has(lib.PDFName.of("Perms")) || fields.some((field) => field instanceof lib.PDFSignature)) {
    throw new Error("PDFs with signature fields require a compatible signing application.");
  }
  return fields.filter((field) => !field.isReadOnly());
}

function formControl(field, lib) {
  if (field instanceof lib.PDFTextField) {
    if (field.isRichFormatted() || field.isPassword()) return null;
    const control = document.createElement(field.isMultiline() ? "textarea" : "input");
    control.value = field.getText() ?? "";
    control.maxLength = field.getMaxLength() ?? 10000;
    return { control, apply: (target) => target.setText(control.value || undefined) };
  }
  if (field instanceof lib.PDFCheckBox) {
    const control = document.createElement("input");
    control.type = "checkbox";
    control.checked = field.isChecked();
    return { control, apply: (target) => control.checked ? target.check() : target.uncheck() };
  }
  if (field instanceof lib.PDFDropdown || field instanceof lib.PDFOptionList || field instanceof lib.PDFRadioGroup) {
    const control = document.createElement("select");
    control.multiple = field.isMultiselect?.() ?? false;
    const selected = [field.getSelected()].flat();
    const options = field.getOptions();
    if (selected.some((value) => value !== undefined && !options.includes(value))) return null;
    if (!control.multiple) control.add(new Option("No selection", ""));
    for (const value of options) control.add(new Option(value, value, false, selected.includes(value)));
    return { control, apply: (target) => {
      const values = [...control.selectedOptions].map((option) => option.value).filter(Boolean);
      if (!values.length) target.clear();
      else target.select(control.multiple ? values : values[0]);
    } };
  }
  return null;
}

export function bindPdfForms(sources, preview) {
  const dialog = document.querySelector("#pdf-form-dialog");
  const form = dialog.querySelector("form");
  const select = dialog.querySelector("[data-source]");
  const fields = dialog.querySelector("[data-fields]");
  const status = dialog.querySelector("[role=status]");
  const save = form.querySelector("[type=submit]");
  const close = form.querySelector("[data-close]");
  let inputs = [];
  let selected = "0";
  let busy = false;
  const canDiscard = () => !inputs.some(({ changed }) => changed) || window.confirm("Discard the unsaved form changes?");

  function renderFields() {
    selected = select.value;
    inputs = [];
    fields.replaceChildren();
    save.disabled = true;
    try {
      const lib = window.PDFLib;
      for (const field of editableFields(sources[selected].document, lib)) {
        const entry = formControl(field, lib);
        if (!entry) continue;
        const name = field.getName();
        const label = document.createElement("label");
        label.textContent = name;
        label.append(entry.control);
        fields.append(label);
        const input = { name, ...entry, changed: false, modified: false };
        entry.control.addEventListener("input", () => {
          input.changed = true;
          input.modified = true;
          save.disabled = false;
        });
        inputs.push(input);
      }
      status.textContent = inputs.length ? "Edit the fields and save a filled copy." : "This PDF has no supported editable form fields.";
    } catch (error) { status.textContent = error.message; }
  }

  document.querySelector("#pdf-form-open").addEventListener("click", () => {
    select.replaceChildren(...sources.map((source, index) => new Option(source.file.name, index)));
    renderFields();
    dialog.showModal();
  });
  select.addEventListener("change", () => {
    if (canDiscard()) renderFields();
    else select.value = selected;
  });
  close.addEventListener("click", () => { if (!busy && canDiscard()) dialog.close(); });
  dialog.addEventListener("cancel", (event) => { if (busy || !canDiscard()) event.preventDefault(); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const changes = inputs.filter(({ changed }) => changed);
    if (busy || !changes.length) return;
    busy = true;
    const controls = [select, close, save, ...inputs.map(({ control }) => control)];
    for (const control of controls) control.disabled = true;
    try {
      const source = sources[selected];
      const copy = await window.PDFLib.PDFDocument.load(await source.file.arrayBuffer(), { updateMetadata: false });
      const target = copy.getForm();
      for (const { name, apply, modified } of inputs) if (modified) apply(target.getField(name));
      const file = new File([await copy.save()], source.file.name.replace(/\.pdf$/i, "") + "-filled.pdf", { type: "application/pdf" });
      preview(file);
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = "Filled PDF downloaded. The preview shows the filled copy.";
      for (const entry of changes) entry.changed = false;
    } catch (error) {
      status.textContent = error.message || "Could not save the filled PDF.";
    } finally {
      for (const control of controls) control.disabled = false;
      save.disabled = !inputs.some(({ changed }) => changed);
      busy = false;
    }
  });
}
