import { buildPivot, calculateSheet, cellAddress, displayCell, maxCellLength, maxColumns, maxRows, numberFormats, parseCsv, toCsv } from "./sheet-model.js";
import { exportWorkbook, importWorkbook, xlsxMime } from "./sheet-xlsx.js";

const $ = (id) => document.getElementById(id);
const storageKey = "adigun-sheets-v1";
const maxSheets = 12;
const blankSheet = () => ({ rows: 20, columns: 8, cells: {}, formats: {} });
const validAddress = /^[A-Z](?:[1-9]\d?|100)$/;
const grid = $("sheet-grid");
let workbook = { active: 0, sheets: [blankSheet()] };
let selectedAddress = "A1";

try {
  const stored = JSON.parse(localStorage.getItem(storageKey));
  if (Array.isArray(stored?.sheets) && stored.sheets.length) {
    const sheets = stored.sheets.slice(0, maxSheets).map((item) => ({
      name: typeof item?.name === "string" ? item.name.slice(0, 31) : "",
      rows: Math.max(20, Math.min(maxRows, Number.isInteger(item?.rows) ? item.rows : 20)),
      columns: Math.max(8, Math.min(maxColumns, Number.isInteger(item?.columns) ? item.columns : 8)),
      cells: Object.fromEntries(Object.entries(item?.cells ?? {}).filter(([key, value]) =>
        validAddress.test(key) && typeof value === "string" && value.length <= maxCellLength)),
      formats: Object.fromEntries(Object.entries(item?.formats ?? {}).filter(([key, value]) =>
        validAddress.test(key) && Object.hasOwn(numberFormats, value))),
      pivot: item?.pivot && Number.isInteger(item.pivot.source) &&
        ["range", "group", "measure", "aggregate"].every((key) => typeof item.pivot[key] === "string" && item.pivot[key].length <= 25)
        ? item.pivot : undefined,
    }));
    const active = Number.isInteger(stored.active) ? Math.max(0, Math.min(stored.active, sheets.length - 1)) : 0;
    workbook = { active, sheets };
  }
} catch {
  status("Local workbook could not be read.");
}

function status(message) { $("sheet-save").textContent = message; }
function currentSheet() { return workbook.sheets[workbook.active]; }

const pivotDialog = $("sheet-pivot-dialog");
$("sheet-pivot").addEventListener("click", () => {
  if (workbook.sheets.length >= maxSheets) { status("The workbook already contains 12 sheets."); return; }
  $("pivot-status").textContent = "";
  pivotDialog.showModal();
});
$("pivot-cancel").addEventListener("click", () => pivotDialog.close());
$("sheet-pivot-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const pivot = Object.fromEntries(["range", "group", "measure", "aggregate"].map((key) => [key, $("pivot-" + key).value]));
  pivot.source = workbook.active;
  try {
    const result = buildPivot(currentSheet().cells, pivot);
    workbook.active = workbook.sheets.push({ ...blankSheet(), ...result, pivot, name: "Pivot " + workbook.sheets.length }) - 1;
    pivotDialog.close();
    save();
    render();
  } catch (error) { $("pivot-status").textContent = error.message; }
});
$("sheet-pivot-refresh").addEventListener("click", () => {
  const sheet = currentSheet();
  const source = workbook.sheets[sheet.pivot?.source];
  if (!source || source === sheet) { status("The source sheet is unavailable."); return; }
  try {
    Object.assign(sheet, buildPivot(source.cells, sheet.pivot));
    save();
    render();
    status("PivotTable refreshed.");
  } catch (error) { status(error.message); }
});

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(workbook));
    status("Saved on this device");
  } catch {
    status("Local saving is unavailable. Download a CSV to keep the active sheet.");
  }
}

function refreshValues() {
  const sheet = currentSheet();
  const valueAt = calculateSheet(sheet.cells);
  for (const field of grid.querySelectorAll("input")) {
    if (document.activeElement !== field) field.value = displayCell(valueAt(field.dataset.cell), sheet.formats?.[field.dataset.cell]);
  }
}

function refreshFormula() {
  $("sheet-selected").textContent = selectedAddress;
  $("sheet-formula").value = currentSheet().cells[selectedAddress] ?? "";
}

function updateCell(address, value) {
  const { cells } = currentSheet();
  if (value) cells[address] = value;
  else delete cells[address];
  $("sheet-export").disabled = Object.keys(cells).length === 0;
  refreshValues();
  refreshFormula();
  save();
}

function render() {
  const sheet = currentSheet();
  $("sheet-pivot-refresh").disabled = !sheet.pivot;
  if (Number(selectedAddress.slice(1)) > sheet.rows || selectedAddress.charCodeAt(0) - 64 > sheet.columns) selectedAddress = "A1";
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
  refreshFormula();
  $("sheet-tabs").replaceChildren(...workbook.sheets.map((_sheet, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-outline";
    button.textContent = _sheet.name || "Sheet " + (index + 1);
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
  if (!event.target.dataset.cell) return;
  selectedAddress = event.target.dataset.cell;
  event.target.value = currentSheet().cells[selectedAddress] ?? "";
  refreshFormula();
});
grid.addEventListener("focusout", () => setTimeout(refreshValues, 0));
grid.addEventListener("input", (event) => {
  const address = event.target.dataset.cell;
  if (!address) return;
  selectedAddress = address;
  updateCell(address, event.target.value);
});
$("sheet-formula").addEventListener("change", (event) => updateCell(selectedAddress, event.target.value));
$("sheet-formula").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); event.currentTarget.blur(); }
});
for (const control of document.querySelectorAll("[data-sheet-format]")) {
  control.addEventListener("click", () => {
    const formats = currentSheet().formats ??= {};
    const format = control.dataset.sheetFormat;
    if (format === "general") delete formats[selectedAddress];
    else formats[selectedAddress] = format;
    refreshValues();
    save();
  });
}
$("sheet-autosum").addEventListener("click", () => {
  const row = Number(selectedAddress.slice(1));
  if (row === 1) { status("Select a cell below the values to sum."); return; }
  const column = selectedAddress[0];
  updateCell(selectedAddress, `=SUM(${column}1:${column}${row - 1})`);
});
$("sheet-gridlines").addEventListener("click", (event) => {
  const hidden = grid.classList.toggle("sheets-no-gridlines");
  event.currentTarget.setAttribute("aria-pressed", String(!hidden));
});
const findDialog = $("sheet-find-dialog");
$("sheet-find").addEventListener("click", () => {
  $("sheet-find-status").textContent = "";
  findDialog.showModal();
  $("sheet-find-query").focus();
});
$("sheet-find-close").addEventListener("click", () => findDialog.close());
$("sheet-find-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const query = $("sheet-find-query").value.trim().toLocaleLowerCase();
  if (!query) return;
  const inputs = [...grid.querySelectorAll("[data-cell]")];
  const offset = inputs.findIndex((input) => input.dataset.cell === selectedAddress) + 1;
  const sheet = currentSheet();
  const valueAt = calculateSheet(sheet.cells);
  const match = [...inputs.slice(offset), ...inputs.slice(0, offset)].find(({ dataset }) => {
    const address = dataset.cell;
    return [sheet.cells[address] ?? "", displayCell(valueAt(address), sheet.formats?.[address])]
      .some((value) => String(value).toLocaleLowerCase().includes(query));
  });
  if (!match) { $("sheet-find-status").textContent = "No matching cells."; return; }
  findDialog.close();
  match.focus();
  status(`Found in ${match.dataset.cell}`);
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
$("workbook-open").addEventListener("click", () => $("workbook-file").click());
$("workbook-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) { status("Choose an XLSX file under 4 MB."); return; }
  try {
    const sheets = importWorkbook(new Uint8Array(await file.arrayBuffer()), window.fflate);
    const emptyWorkbook = workbook.sheets.length === 1 && !Object.keys(workbook.sheets[0].cells).length;
    const existing = emptyWorkbook ? [] : workbook.sheets;
    if (existing.length + sheets.length > maxSheets) { status("The import would exceed the workbook’s 12-sheet limit."); return; }
    workbook = { active: existing.length, sheets: [...existing, ...sheets] };
    save();
    render();
    status("Excel values and formulas imported. Original formatting is not included.");
  } catch (error) {
    status(error.message || "This Excel file could not be opened.");
  }
});

function download(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$("sheet-export").addEventListener("click", () => {
  download(toCsv(currentSheet().cells), "text/csv;charset=utf-8", "adigun-sheet-" + (workbook.active + 1) + ".csv");
});
$("workbook-export").addEventListener("click", () => {
  try {
    download(exportWorkbook(workbook.sheets, window.fflate), xlsxMime, "adigun-workbook.xlsx");
  } catch {
    status("The Excel workbook could not be exported.");
  }
});

render();
