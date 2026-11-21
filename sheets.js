import { calculateSheet, cellAddress, maxCellLength, maxColumns, maxRows, parseCsv, toCsv } from "./sheet-model.js";

const $ = (id) => document.getElementById(id);
const storageKey = "adigun-sheets-v1";
const maxSheets = 12;
const blankSheet = () => ({ rows: 20, columns: 8, cells: {} });
const validAddress = /^[A-Z](?:[1-9]\d?|100)$/;
const grid = $("sheet-grid");
let workbook = { active: 0, sheets: [blankSheet()] };

try {
  const stored = JSON.parse(localStorage.getItem(storageKey));
  if (Array.isArray(stored?.sheets) && stored.sheets.length) {
    const sheets = stored.sheets.slice(0, maxSheets).map((item) => ({
      rows: Math.max(20, Math.min(maxRows, Number.isInteger(item?.rows) ? item.rows : 20)),
      columns: Math.max(8, Math.min(maxColumns, Number.isInteger(item?.columns) ? item.columns : 8)),
      cells: Object.fromEntries(Object.entries(item?.cells ?? {}).filter(([key, value]) =>
        validAddress.test(key) && typeof value === "string" && value.length <= maxCellLength)),
    }));
    const active = Number.isInteger(stored.active) ? Math.max(0, Math.min(stored.active, sheets.length - 1)) : 0;
    workbook = { active, sheets };
  }
} catch {
  status("Local workbook could not be read.");
}

function status(message) { $("sheet-save").textContent = message; }
function currentSheet() { return workbook.sheets[workbook.active]; }

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(workbook));
    status("Saved on this device");
  } catch {
    status("Local saving is unavailable. Download a CSV to keep the active sheet.");
  }
}

function refreshValues() {
  const valueAt = calculateSheet(currentSheet().cells);
  for (const field of grid.querySelectorAll("input")) {
    if (document.activeElement !== field) field.value = valueAt(field.dataset.cell);
  }
}

function render() {
  const sheet = currentSheet();
  const header = document.createElement("thead");
  const heading = header.insertRow();
  heading.append(document.createElement("td"));
  for (let column = 0; column < sheet.columns; column++) {
    const label = document.createElement("th");
    label.scope = "col";
    label.textContent = String.fromCharCode(65 + column);
    heading.append(label);
  }
  const body = document.createElement("tbody");
  for (let row = 0; row < sheet.rows; row++) {
    const line = body.insertRow();
    const label = document.createElement("th");
    label.scope = "row";
    label.textContent = row + 1;
    line.append(label);
    for (let column = 0; column < sheet.columns; column++) {
      const cell = line.insertCell();
      const field = document.createElement("input");
      const address = cellAddress(row, column);
      field.dataset.cell = address;
      field.setAttribute("aria-label", address);
      field.maxLength = maxCellLength;
      field.autocomplete = "off";
      field.spellcheck = false;
      cell.append(field);
    }
  }
  grid.replaceChildren(header, body);
  refreshValues();
  $("sheet-tabs").replaceChildren(...workbook.sheets.map((_sheet, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-outline";
    button.textContent = "Sheet " + (index + 1);
    button.setAttribute("aria-pressed", String(index === workbook.active));
    button.addEventListener("click", () => { workbook.active = index; save(); render(); $("sheet-tabs").children[index].focus(); });
    return button;
  }));
  $("sheet-add").disabled = workbook.sheets.length >= maxSheets;
  $("sheet-add-row").disabled = sheet.rows >= maxRows;
  $("sheet-add-column").disabled = sheet.columns >= maxColumns;
  $("sheet-export").disabled = Object.keys(sheet.cells).length === 0;
}

grid.addEventListener("focusin", (event) => {
  if (event.target.dataset.cell) event.target.value = currentSheet().cells[event.target.dataset.cell] ?? "";
});
grid.addEventListener("focusout", () => setTimeout(refreshValues, 0));
grid.addEventListener("input", (event) => {
  const address = event.target.dataset.cell;
  if (!address) return;
  const { cells } = currentSheet();
  if (event.target.value) cells[address] = event.target.value;
  else delete cells[address];
  $("sheet-export").disabled = Object.keys(cells).length === 0;
  refreshValues();
  save();
});
grid.addEventListener("keydown", (event) => {
  const address = event.target.dataset.cell;
  if (event.key !== "Enter" || !address || event.isComposing) return;
  event.preventDefault();
  const row = Number(address.slice(1)) + (event.shiftKey ? -1 : 1);
  grid.querySelector(`[data-cell="${address[0]}${row}"]`)?.focus();
});
$("sheet-add").addEventListener("click", () => {
  workbook.active = workbook.sheets.push(blankSheet()) - 1;
  save();
  render();
  grid.querySelector('[data-cell="A1"]').focus();
});
$("sheet-add-row").addEventListener("click", () => {
  currentSheet().rows++;
  save();
  render();
});
$("sheet-add-column").addEventListener("click", () => {
  currentSheet().columns++;
  save();
  render();
});
$("sheet-open").addEventListener("click", () => $("sheet-file").click());
$("sheet-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (workbook.sheets.length >= maxSheets) { status("The workbook already contains 12 sheets."); return; }
  if (file.size > 1024 * 1024) { status("Choose a CSV file under 1 MB."); return; }
  try {
    const rows = parseCsv((await file.text()).replace(/^\uFEFF/, ""));
    if (workbook.sheets.length >= maxSheets) { status("The workbook already contains 12 sheets."); return; }
    const sheet = blankSheet();
    sheet.rows = Math.max(sheet.rows, rows.length);
    for (const [row, fields] of rows.entries()) {
      sheet.columns = Math.max(sheet.columns, fields.length);
      fields.forEach((value, column) => { if (value) sheet.cells[cellAddress(row, column)] = value; });
    }
    workbook.active = workbook.sheets.push(sheet) - 1;
    save();
    render();
  } catch (error) {
    status(error.message || "This CSV could not be opened.");
  }
});
$("sheet-export").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([toCsv(currentSheet().cells)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "adigun-sheet-" + (workbook.active + 1) + ".csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

render();
