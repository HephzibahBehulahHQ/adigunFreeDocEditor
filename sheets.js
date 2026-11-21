import { buildPivot, calculateWorkbook, cellAddress, displayCell, maxCellLength, maxColumns, maxRows, numberFormats, parseCsv, toCsv } from "./sheet-model.js";
import { exportWorkbook, importWorkbook, xlsxMime } from "./sheet-xlsx.js";

const $ = (id) => document.getElementById(id);
const storageKey = "adigun-sheets-v1";
const maxSheets = 12;
const blankSheet = () => ({ rows: 20, columns: 8, cells: {}, formats: {} });
const validAddress = /^[A-Z](?:[1-9]\d?|100)$/;
const grid = $("sheet-grid");
let workbook = { active: 0, sheets: [blankSheet()] };
let selectedAddress = "A1";
let selectedRange = null;
const undoStack = [];
const redoStack = [];
let editingAddress;

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
      freezeFirstRow: item?.freezeFirstRow === true,
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
function workbookValues(index = workbook.active) { return calculateWorkbook(workbook.sheets, index); }

function updateHistoryButtons() {
  $("sheet-undo").disabled = !undoStack.length;
  $("sheet-redo").disabled = !redoStack.length;
}

function recordEdit(address) {
  if (address && editingAddress === address) return;
  undoStack.push(structuredClone(workbook));
  if (undoStack.length > 30) undoStack.shift();
  redoStack.length = 0;
  editingAddress = address;
  updateHistoryButtons();
}

function restoreEdit(from, to) {
  if (!from.length) return;
  to.push(workbook);
  workbook = from.pop();
  editingAddress = undefined;
  save();
  render();
  updateHistoryButtons();
}

$("sheet-undo").addEventListener("click", () => restoreEdit(undoStack, redoStack));
$("sheet-redo").addEventListener("click", () => restoreEdit(redoStack, undoStack));

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
    const result = buildPivot(currentSheet().cells, pivot, workbookValues());
    recordEdit();
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
    const result = buildPivot(source.cells, sheet.pivot, workbookValues(sheet.pivot.source));
    recordEdit();
    Object.assign(sheet, result);
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
  const valueAt = workbookValues();
  for (const field of grid.querySelectorAll("input")) {
    if (document.activeElement !== field) field.value = displayCell(valueAt(field.dataset.cell), sheet.formats?.[field.dataset.cell]);
  }
  refreshSelection(valueAt);
}

function selectionAddresses() {
  if (!selectedRange) return [selectedAddress];
  const { firstRow, lastRow, firstColumn, lastColumn } = selectedRange;
  const addresses = [];
  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = firstColumn; column <= lastColumn; column++) addresses.push(cellAddress(row, column));
  }
  return addresses;
}

function refreshSelection(valueAt = workbookValues()) {
  const addresses = selectionAddresses();
  const selected = new Set(addresses);
  for (const field of grid.querySelectorAll("[data-cell]")) {
    field.parentElement.classList.toggle("sheet-range-cell", selected.has(field.dataset.cell));
    field.parentElement.classList.toggle("sheet-active-cell", field.dataset.cell === selectedAddress);
  }
  const values = addresses.map(valueAt).filter((value) => value !== "");
  const numbers = values.filter((value) => typeof value === "number" ||
    (typeof value === "string" && /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim()))).map(Number).filter(Number.isFinite);
  const sum = numbers.reduce((total, value) => total + value, 0);
  const format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 });
  $("sheet-active-name").textContent = currentSheet().name || `Sheet ${workbook.active + 1}`;
  $("sheet-selection-statistics").textContent = `Count ${values.length} · Sum ${format.format(sum)} · Average ${numbers.length ? format.format(sum / numbers.length) : "—"}`;
}

function refreshFormula() {
  $("sheet-selected").value = selectedRange?.label || selectedAddress;
  $("sheet-formula").value = currentSheet().cells[selectedAddress] ?? "";
}

function updateCell(address, value, mergeTyping = false) {
  const { cells } = currentSheet();
  if ((cells[address] ?? "") === value) return;
  recordEdit(mergeTyping ? address : undefined);
  if (value) cells[address] = value;
  else delete cells[address];
  $("sheet-export").disabled = Object.keys(cells).length === 0;
  refreshValues();
  refreshFormula();
  save();
}

function render() {
  const sheet = currentSheet();
  selectedRange = null;
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
  grid.style.setProperty("--sheet-heading-height", header.offsetHeight + "px");
  grid.classList.toggle("sheet-freeze-row", Boolean(sheet.freezeFirstRow));
  $("sheet-freeze-row").setAttribute("aria-pressed", String(Boolean(sheet.freezeFirstRow)));
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
  selectedRange = null;
  event.target.value = currentSheet().cells[selectedAddress] ?? "";
  refreshFormula();
  refreshSelection();
});
grid.addEventListener("focusout", () => {
  editingAddress = undefined;
  setTimeout(refreshValues, 0);
});
grid.addEventListener("input", (event) => {
  const address = event.target.dataset.cell;
  if (!address) return;
  selectedAddress = address;
  updateCell(address, event.target.value, true);
});
grid.addEventListener("paste", (event) => {
  const address = event.target.dataset.cell;
  const text = event.clipboardData?.getData("text/plain");
  if (!address || !text || !/[\t\n\r]/.test(text)) return;
  event.preventDefault();
  try {
    if (text.length > 1024 * 1024) throw new Error("Paste up to 1 MB of tabular text.");
    const rows = parseCsv(text, "\t");
    const row = Number(address.slice(1)) - 1;
    const column = address.charCodeAt(0) - 65;
    const width = Math.max(...rows.map((fields) => fields.length));
    if (row + rows.length > maxRows || column + width > maxColumns) throw new Error("The pasted range exceeds the workbook grid.");
    recordEdit();
    const sheet = currentSheet();
    sheet.rows = Math.max(sheet.rows, row + rows.length);
    sheet.columns = Math.max(sheet.columns, column + width);
    for (const [offset, fields] of rows.entries()) {
      for (const [index, value] of fields.entries()) {
        const target = cellAddress(row + offset, column + index);
        if (value) sheet.cells[target] = value;
        else delete sheet.cells[target];
      }
    }
    save();
    render();
    grid.querySelector(`[data-cell="${address}"]`).focus();
  } catch (error) { status(error.message); }
});
$("sheet-formula").addEventListener("change", (event) => updateCell(selectedAddress, event.target.value));
$("sheet-selected").addEventListener("keydown", (event) => {
  if (event.key === "Escape") { refreshFormula(); return; }
  if (event.key !== "Enter" || event.isComposing) return;
  event.preventDefault();
  const name = event.currentTarget;
  const label = name.value.trim().toUpperCase();
  const [first, last = first, extra] = label.split(":");
  const field = (address) => validAddress.test(address) && grid.querySelector(`[data-cell="${address}"]`);
  if (!field(first) || !field(last) || extra !== undefined) {
    status("Enter a cell or range within this sheet, such as B2 or B2:F12.");
    return;
  }
  field(first).focus();
  if (first !== last) {
    const rows = [first, last].map((address) => Number(address.slice(1)) - 1);
    const columns = [first, last].map((address) => address.charCodeAt(0) - 65);
    selectedRange = {
      firstRow: Math.min(...rows), lastRow: Math.max(...rows),
      firstColumn: Math.min(...columns), lastColumn: Math.max(...columns), label,
    };
    refreshFormula();
    refreshSelection();
  }
});
$("sheet-formula").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); event.currentTarget.blur(); }
});
for (const control of document.querySelectorAll("[data-sheet-format]")) {
  control.addEventListener("click", () => {
    recordEdit();
    const formats = currentSheet().formats ??= {};
    const format = control.dataset.sheetFormat;
    for (const address of selectionAddresses()) {
      if (format === "general") delete formats[address];
      else formats[address] = format;
    }
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
$("sheet-freeze-row").addEventListener("click", () => {
  recordEdit();
  const sheet = currentSheet();
  sheet.freezeFirstRow = !sheet.freezeFirstRow;
  save();
  render();
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
  const valueAt = workbookValues();
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
  const key = event.key.toLowerCase();
  if (address && !event.isComposing && (event.ctrlKey || event.metaKey) && !event.altKey && ["z", "y"].includes(key)) {
    event.preventDefault();
    $(key === "y" || event.shiftKey ? "sheet-redo" : "sheet-undo").click();
    grid.querySelector(`[data-cell="${selectedAddress}"]`)?.focus();
    return;
  }
  if (event.key !== "Enter" || !address || event.isComposing) return;
  event.preventDefault();
  const row = Number(address.slice(1)) + (event.shiftKey ? -1 : 1);
  grid.querySelector(`[data-cell="${address[0]}${row}"]`)?.focus();
});
$("sheet-add").addEventListener("click", () => {
  recordEdit();
  workbook.active = workbook.sheets.push(blankSheet()) - 1;
  save();
  render();
  grid.querySelector('[data-cell="A1"]').focus();
});
$("sheet-add-row").addEventListener("click", () => {
  recordEdit();
  currentSheet().rows++;
  save();
  render();
});
$("sheet-add-column").addEventListener("click", () => {
  recordEdit();
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
    recordEdit();
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
    recordEdit();
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
  download(toCsv(currentSheet().cells, workbookValues()), "text/csv;charset=utf-8", "adigun-sheet-" + (workbook.active + 1) + ".csv");
});
$("workbook-export").addEventListener("click", () => {
  try {
    download(exportWorkbook(workbook.sheets, window.fflate), xlsxMime, "adigun-workbook.xlsx");
  } catch {
    status("The Excel workbook could not be exported.");
  }
});

render();
