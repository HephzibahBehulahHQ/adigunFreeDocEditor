import { buildPivot, calculateWorkbook, cellAddress, chartValues, displayCell, hiddenFilterRows, maxCellLength, maxColumns, maxRows, numberFormats, parseChartRange, parseCsv, parseSheetFilter, shiftCellFormula, toCsv, validationOptions } from "./sheet-model.js";
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
      filter: parseSheetFilter(item?.filter),
      chart: parseChartRange(item?.chart?.range),
      validation: Object.fromEntries(Object.entries(item?.validation ?? {})
        .filter(([address, options]) => validAddress.test(address) && validationOptions(options).length)),
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
    if (Object.entries(result.cells).some(([address, value]) => !acceptsValue(sheet, address, value))) {
      throw new Error("Remove the conflicting dropdown validation before refreshing this PivotTable.");
    }
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
  const hidden = hiddenFilterRows(sheet.filter, valueAt);
  for (const [index, row] of [...grid.tBodies[0].rows].entries()) {
    row.hidden = hidden.has(index + 1) && !row.contains(document.activeElement);
  }
  $("sheet-filter-clear").disabled = !sheet.filter;
  refreshSelection(valueAt);
  refreshChart(valueAt);
}

const chartPanel = $("sheet-chart-panel");
const chartForm = $("sheet-chart-form");

function refreshChart(valueAt) {
  const chart = currentSheet().chart;
  $("sheet-chart-remove").disabled = !chart;
  if (chartPanel.hidden) return;
  const values = chart ? chartValues(chart, valueAt) : [];
  const measure = chart && (valueAt(chart.values + chart.first) || chart.values);
  $("sheet-chart-title").textContent = measure ? `Bar chart · ${measure}` : "Bar chart";
  $("sheet-chart-message").textContent = !chart ? "Choose a label column and a numeric column." :
    values.length ? "" : "This range contains no numeric values.";
  const magnitude = Math.max(1, ...values.map(({ value }) => Math.abs(value)));
  const negative = values.some(({ value }) => value < 0);
  const baseline = negative ? 50 : 0;
  $("sheet-chart-values").replaceChildren(...values.map(({ label, value }) => {
    const row = document.createElement("li");
    const name = document.createElement("span");
    const number = document.createElement("span");
    const track = document.createElement("div");
    const bar = document.createElement("div");
    name.textContent = label;
    number.textContent = new Intl.NumberFormat().format(value);
    track.className = "sheet-chart-track";
    track.setAttribute("aria-hidden", "true");
    bar.className = value < 0 ? "sheet-chart-bar negative" : "sheet-chart-bar";
    const width = Math.abs(value / magnitude) * (negative ? 50 : 100);
    bar.style.left = (value < 0 ? baseline - width : baseline) + "%";
    bar.style.width = width + "%";
    track.append(bar);
    row.append(name, number, track);
    return row;
  }));
}

function showChartPanel(open) {
  chartPanel.hidden = !open;
  $("sheet-chart-open").setAttribute("aria-expanded", String(open));
  if (open) {
    chartForm.elements.range.value = currentSheet().chart?.range || selectedRange?.label || "";
    refreshChart(workbookValues());
    chartForm.elements.range.focus();
  }
}

$("sheet-chart-open").addEventListener("click", () => showChartPanel(true));
$("sheet-chart-close").addEventListener("click", () => {
  showChartPanel(false);
  $("sheet-chart-open").focus();
});
chartForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const chart = parseChartRange(chartForm.elements.range.value);
  const sheet = currentSheet();
  if (!chart || chart.last > sheet.rows || chart.values.charCodeAt(0) - 64 > sheet.columns) {
    $("sheet-chart-message").textContent = "Choose two adjacent columns and at least one data row below the headers.";
    return;
  }
  recordEdit();
  sheet.chart = chart;
  save();
  refreshChart(workbookValues());
});
$("sheet-chart-remove").addEventListener("click", () => {
  recordEdit();
  currentSheet().chart = null;
  chartForm.elements.range.value = "";
  save();
  refreshChart(workbookValues());
});

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
  const picker = $("sheet-validation-picker");
  const options = currentSheet().validation?.[selectedAddress] || [];
  picker.hidden = !options.length;
  picker.replaceChildren(new Option("Choose value", ""), ...options.map((value) => new Option(value)));
  picker.value = options.includes($("sheet-formula").value) ? $("sheet-formula").value : "";
  $("sheet-fill-down").disabled = !selectedRange || selectedRange.firstRow === selectedRange.lastRow;
  $("sheet-fill-right").disabled = !selectedRange || selectedRange.firstColumn === selectedRange.lastColumn;
}

function acceptsValue(sheet, address, value) {
  return !value || !sheet.validation?.[address] || sheet.validation[address].includes(value);
}

function updateCell(address, value, mergeTyping = false) {
  const sheet = currentSheet();
  const { cells } = sheet;
  if (!acceptsValue(sheet, address, value)) {
    status(`Choose an allowed value for ${address}.`);
    refreshFormula();
    return;
  }
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
  chartForm.elements.range.value = sheet.chart?.range ?? "";
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
  if (!currentSheet().validation?.[address]) updateCell(address, event.target.value, true);
});
grid.addEventListener("change", (event) => {
  const address = event.target.dataset.cell;
  if (currentSheet().validation?.[address]) updateCell(address, event.target.value);
});
$("sheet-validation-picker").addEventListener("change", (event) => updateCell(selectedAddress, event.target.value));

const validationDialog = $("sheet-validation-dialog");
const validationForm = validationDialog.querySelector("form");
const validationStatus = validationForm.querySelector("[role=status]");
$("sheet-validation").addEventListener("click", () => {
  $("sheet-validation-range").value = selectedRange?.label || selectedAddress;
  validationForm.elements.options.value = currentSheet().validation?.[selectedAddress]?.join("\n") ?? "";
  validationStatus.textContent = "";
  validationDialog.showModal();
});

const filterDialog = $("sheet-filter-dialog");
const filterForm = filterDialog.querySelector("form");
const filterStatus = filterForm.querySelector("[role=status]");
$("sheet-filter").addEventListener("click", () => {
  const sheet = currentSheet();
  const filter = sheet.filter;
  filterForm.elements.range.value = filter?.range || selectedRange?.label || `A1:${cellAddress(sheet.rows - 1, sheet.columns - 1)}`;
  filterForm.elements.column.value = filter?.column || selectedAddress[0];
  filterForm.elements.value.value = filter?.value ?? "";
  filterStatus.textContent = "";
  filterDialog.showModal();
});
filterDialog.querySelector("[data-close]").addEventListener("click", () => filterDialog.close());
filterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const { range, column, value } = filterForm.elements;
  const filter = parseSheetFilter({ range: range.value, column: column.value, value: value.value });
  const end = filter?.range.split(":")[1];
  const sheet = currentSheet();
  if (!end || Number(end.slice(1)) > sheet.rows || end.charCodeAt(0) - 64 > sheet.columns) {
    filterStatus.textContent = "Choose a header row, data rows and a filter column within this sheet.";
    return;
  }
  recordEdit();
  sheet.filter = filter;
  save();
  filterDialog.close();
  refreshValues();
});
$("sheet-filter-clear").addEventListener("click", () => {
  recordEdit();
  currentSheet().filter = null;
  save();
  refreshValues();
});
validationDialog.querySelector("[data-close]").addEventListener("click", () => validationDialog.close());
validationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const values = validationForm.elements.options.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const allowed = validationOptions(values);
  if (values.length && !allowed.length) {
    validationStatus.textContent = "Use short values without commas, quotation marks, or formula prefixes.";
    return;
  }
  const sheet = currentSheet();
  const addresses = selectionAddresses();
  const invalid = addresses.find((address) => allowed.length && sheet.cells[address] && !allowed.includes(sheet.cells[address]));
  if (invalid) {
    validationStatus.textContent = `Include the existing value in ${invalid} or change that cell first.`;
    return;
  }
  recordEdit();
  sheet.validation ??= {};
  for (const address of addresses) {
    if (allowed.length) sheet.validation[address] = allowed;
    else delete sheet.validation[address];
  }
  save();
  validationDialog.close();
  refreshFormula();
});
function applyCellChanges(entries) {
  const sheet = currentSheet();
  const changes = entries.filter(([address, value]) => (sheet.cells[address] ?? "") !== value);
  const invalid = changes.find(([address, value]) => !acceptsValue(sheet, address, value));
  if (invalid) throw new Error(`Choose an allowed value for ${invalid[0]}.`);
  if (!changes.length) return;
  recordEdit();
  for (const [address, value] of changes) {
    sheet.rows = Math.max(sheet.rows, Number(address.slice(1)));
    sheet.columns = Math.max(sheet.columns, address.charCodeAt(0) - 64);
    if (value) sheet.cells[address] = value;
    else delete sheet.cells[address];
  }
  save();
}

function pasteCells(address, text) {
  if (!text) return;
  try {
    if (text.length > 1024 * 1024) throw new Error("Paste up to 1 MB of tabular text.");
    const rows = /[\t\n\r]/.test(text) ? parseCsv(text, "\t") : [[text]];
    if (rows.some((fields) => fields.some((value) => value.length > maxCellLength))) throw new Error("A pasted cell exceeds the text limit.");
    const row = Number(address.slice(1)) - 1;
    const column = address.charCodeAt(0) - 65;
    const width = Math.max(...rows.map((fields) => fields.length));
    if (row + rows.length > maxRows || column + width > maxColumns) throw new Error("The pasted range exceeds the workbook grid.");
    applyCellChanges(rows.flatMap((fields, offset) => fields.map((value, index) => [cellAddress(row + offset, column + index), value])));
    render();
    grid.querySelector(`[data-cell="${address}"]`).focus();
  } catch (error) { status(error.message); }
}
grid.addEventListener("paste", (event) => {
  const address = event.target.dataset.cell;
  const text = event.clipboardData?.getData("text/plain");
  if (!address || !text || !/[\t\n\r]/.test(text)) return;
  event.preventDefault();
  pasteCells(address, text);
});

async function copySelection(cut) {
  const sheet = currentSheet();
  const addresses = selectionAddresses();
  const values = addresses.map((address) => sheet.cells[address] ?? "");
  const columns = selectedRange ? selectedRange.lastColumn - selectedRange.firstColumn + 1 : 1;
  const rows = [];
  const quote = (value) => /["\t\r\n]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value;
  for (let index = 0; index < values.length; index += columns) {
    rows.push(values.slice(index, index + columns).map(quote).join("\t"));
  }
  const text = values.length === 1 && !/[\t\r\n]/.test(values[0]) ? values[0] : rows.join("\r\n");
  try { await navigator.clipboard.writeText(text); }
  catch { status("Clipboard access is unavailable in this browser."); return; }
  if (cut && (sheet !== currentSheet() || addresses.some((address, index) => (sheet.cells[address] ?? "") !== values[index]))) {
    status("Copied. The selection changed before it could be cut.");
    return;
  }
  if (cut) clearSelection(addresses);
  status(cut ? "Cut to clipboard." : "Copied to clipboard.");
}
$("sheet-copy").addEventListener("click", () => void copySelection(false));
$("sheet-cut").addEventListener("click", () => void copySelection(true));
$("sheet-paste").addEventListener("click", async () => {
  const sheet = currentSheet();
  const address = selectedAddress;
  try {
    const text = await navigator.clipboard.readText();
    if (currentSheet() === sheet && selectedAddress === address) pasteCells(address, text);
  } catch { status("Select a cell and use your browser’s Paste shortcut."); }
});

function clearSelection(addresses = selectionAddresses()) {
  applyCellChanges(addresses.map((address) => [address, ""]));
  $("sheet-export").disabled = Object.keys(currentSheet().cells).length === 0;
  refreshValues();
  refreshFormula();
}
$("sheet-clear-cells").addEventListener("click", () => clearSelection());

function fillSelection(down) {
  if (!selectedRange) return;
  const { firstRow, lastRow, firstColumn, lastColumn } = selectedRange;
  const cells = currentSheet().cells;
  const changes = [];
  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      const rowDelta = down ? row - firstRow : 0;
      const columnDelta = down ? 0 : column - firstColumn;
      if (!rowDelta && !columnDelta) continue;
      const source = cells[cellAddress(row - rowDelta, column - columnDelta)] ?? "";
      changes.push([cellAddress(row, column), shiftCellFormula(source, rowDelta, columnDelta)]);
    }
  }
  try {
    applyCellChanges(changes);
    $("sheet-export").disabled = Object.keys(cells).length === 0;
    refreshValues();
    refreshFormula();
  } catch (error) { status(error.message); }
}
$("sheet-fill-down").addEventListener("click", () => fillSelection(true));
$("sheet-fill-right").addEventListener("click", () => fillSelection(false));
$("sheet-formula").addEventListener("change", (event) => updateCell(selectedAddress, event.target.value));
$("sheet-selected").addEventListener("keydown", (event) => {
  if (event.key === "Escape") { refreshFormula(); return; }
  if (event.key !== "Enter" || event.isComposing) return;
  event.preventDefault();
  const name = event.currentTarget;
  const label = name.value.trim().toUpperCase();
  const [first, last = first, extra] = label.split(":");
  const field = (address) => validAddress.test(address) && grid.querySelector(`[data-cell="${address}"]`);
  if (!field(first) || !field(last) || extra !== undefined || field(first).closest("tr").hidden) {
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
  const direction = event.shiftKey ? -1 : 1;
  for (let row = Number(address.slice(1)) + direction; row > 0 && row <= currentSheet().rows; row += direction) {
    const field = grid.querySelector(`[data-cell="${address[0]}${row}"]`);
    if (field.closest("tr").hidden) continue;
    field.focus();
    break;
  }
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
    status("Excel data and supported workbook settings imported.");
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
