import { buildPivot, calculateWorkbook, cellAddress, chartValues, conditionalFill, displayCell, hiddenFilterRows, maxCellLength, maxColumns, maxRows, normalizeCellStyle, normalizeConditionalRule, normalizeNamedRange, normalizeNamedRanges, numberFormats, parseChartRange, parseCsv, parseSheetFilter, removeDuplicateRecords, renameSheetReferences, shiftCellFormula, sortSheetRange, splitColumnText, spreadsheetFonts, toCsv, validationOptions } from "./sheet-model.js";
import { exportWorkbook, importWorkbook, xlsxMime } from "./sheet-xlsx.js";
import { bindSheetPrinting } from "./sheet-print.js";

const $ = (id) => document.getElementById(id);
const storageKey = "adigun-sheets-v1";
const maxSheets = 12;
const defaultWorkbookName = "Untitled workbook";
const blankSheet = () => ({ rows: 20, columns: 8, cells: {}, formats: {} });
const validAddress = /^[A-Z](?:[1-9]\d?|100)$/;
const grid = $("sheet-grid");
let workbook = { name: defaultWorkbookName, active: 0, sheets: [blankSheet()] };
let selectedAddress = "A1";
let selectedRange = null;
const undoStack = [];
const redoStack = [];
let editingAddress;

try {
  const stored = JSON.parse(localStorage.getItem(storageKey));
  if (Array.isArray(stored?.sheets) && stored.sheets.length) {
    const sheets = stored.sheets.slice(0, maxSheets).map((item, index) => ({
      name: typeof item?.name === "string" && item.name ? item.name.slice(0, 31) : `Sheet ${index + 1}`,
      rows: Math.max(20, Math.min(maxRows, Number.isInteger(item?.rows) ? item.rows : 20)),
      columns: Math.max(8, Math.min(maxColumns, Number.isInteger(item?.columns) ? item.columns : 8)),
      cells: Object.fromEntries(Object.entries(item?.cells ?? {}).filter(([key, value]) =>
        validAddress.test(key) && typeof value === "string" && value.length <= maxCellLength)),
      formats: Object.fromEntries(Object.entries(item?.formats ?? {}).filter(([key, value]) =>
        validAddress.test(key) && Object.hasOwn(numberFormats, value))),
      styles: Object.fromEntries(Object.entries(item?.styles ?? {}).filter(([key]) => validAddress.test(key))
        .map(([address, value]) => [address, normalizeCellStyle(value)])),
      freezeFirstRow: item?.freezeFirstRow === true,
      filter: parseSheetFilter(item?.filter),
      chart: parseChartRange(item?.chart?.range),
      conditionalRule: normalizeConditionalRule(item?.conditionalRule),
      hidden: item?.hidden === true,
      print: item?.print,
      validation: Object.fromEntries(Object.entries(item?.validation ?? {})
        .filter(([address, options]) => validAddress.test(address) && validationOptions(options).length)),
      pivot: item?.pivot && Number.isInteger(item.pivot.source) &&
        ["range", "group", "measure", "aggregate"].every((key) => typeof item.pivot[key] === "string" && item.pivot[key].length <= 25)
        ? item.pivot : undefined,
    }));
    let active = Number.isInteger(stored.active) ? Math.max(0, Math.min(stored.active, sheets.length - 1)) : 0;
    if (sheets[active].hidden) active = Math.max(0, sheets.findIndex((sheet) => !sheet.hidden));
    sheets[active].hidden = false;
    workbook = { name: typeof stored.name === "string" && stored.name.trim() ? stored.name.slice(0, 100) : defaultWorkbookName, active, sheets, date1904: stored.date1904 === true,
      namedRanges: normalizeNamedRanges(stored.namedRanges) };
  }
} catch {
  status("Local workbook could not be read.");
}

function status(message) { $("sheet-save").textContent = message; }
function currentSheet() { return workbook.sheets[workbook.active]; }
function workbookValues(index = workbook.active) { return calculateWorkbook(workbook.sheets, index, workbook.date1904, workbook.namedRanges); }
function sheetName(index) { return workbook.sheets[index].name || `Sheet ${index + 1}`; }

function uniqueName(base, used = new Set(workbook.sheets.map((_, index) => sheetName(index).toUpperCase()))) {
  const compact = base.slice(0, 31);
  if (!used.has(compact.toUpperCase())) return compact;
  for (let number = 2; ; number++) {
    const suffix = " " + number;
    const candidate = base.slice(0, 31 - suffix.length) + suffix;
    if (!used.has(candidate.toUpperCase())) return candidate;
  }
}

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
    const name = uniqueName("Pivot " + workbook.sheets.length);
    workbook.active = workbook.sheets.push({ ...blankSheet(), ...result, pivot, name }) - 1;
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
    status("Local saving is unavailable. Download Excel to keep the workbook.");
  }
}

function refreshValues() {
  const sheet = currentSheet();
  const valueAt = workbookValues();
  const fillAt = conditionalFill(sheet.conditionalRule);
  for (const field of grid.querySelectorAll("input")) {
    const address = field.dataset.cell;
    const value = valueAt(address);
    if (document.activeElement !== field) field.value = displayCell(value, sheet.formats?.[address], undefined, workbook.date1904);
    const fill = fillAt(address, value);
    field.toggleAttribute("data-conditional-fill", Boolean(fill));
    if (fill) field.style.setProperty("--conditional-fill", "#" + fill);
    else field.style.removeProperty("--conditional-fill");
    const style = sheet.styles?.[address];
    field.style.fontFamily = style?.font || "";
    field.style.fontSize = style?.size ? style.size + "pt" : "";
    field.style.fontWeight = style?.bold ? "700" : "";
    field.style.fontStyle = style?.italic ? "italic" : "";
    field.style.textDecoration = style?.underline ? "underline" : "";
    field.style.textAlign = style?.align || "";
    field.style.color = style?.color ? "#" + style.color : "";
    field.toggleAttribute("data-cell-fill", Boolean(style?.fill));
    field.toggleAttribute("data-cell-border", Boolean(style?.border));
    if (style?.fill) field.style.setProperty("--cell-fill", "#" + style.fill);
    else field.style.removeProperty("--cell-fill");
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
    showRulePanel(false);
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

const rulePanel = $("sheet-rule-panel");
const ruleForm = $("sheet-rule-form");
function refreshRuleForm() {
  const { range, operator, threshold, color } = ruleForm.elements;
  const rule = currentSheet().conditionalRule;
  range.value = rule?.range || selectedRange?.label || selectedAddress;
  operator.value = rule?.operator || "greaterThan";
  threshold.value = rule?.threshold ?? "";
  color.value = rule?.color || "yellow";
  $("sheet-rule-remove").disabled = !rule;
  $("sheet-rule-status").textContent = "";
}
function showRulePanel(open) {
  rulePanel.hidden = !open;
  $("sheet-rule-open").setAttribute("aria-expanded", String(open));
  if (open) {
    showChartPanel(false);
    refreshRuleForm();
    ruleForm.elements.range.focus();
  }
}
$("sheet-rule-open").addEventListener("click", () => showRulePanel(true));
$("sheet-rule-close").addEventListener("click", () => {
  showRulePanel(false);
  $("sheet-rule-open").focus();
});
ruleForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const { range, operator, threshold, color } = ruleForm.elements;
  const rule = normalizeConditionalRule({ range: range.value, operator: operator.value, threshold: threshold.valueAsNumber, color: color.value });
  const sheet = currentSheet();
  const end = rule?.range.split(":").at(-1);
  if (!end || Number(end.slice(1)) > sheet.rows || end.charCodeAt(0) - 64 > sheet.columns) {
    $("sheet-rule-status").textContent = "Choose a valid range and number within this sheet.";
    return;
  }
  recordEdit();
  sheet.conditionalRule = rule;
  save();
  refreshValues();
  refreshRuleForm();
});
$("sheet-rule-remove").addEventListener("click", () => {
  recordEdit();
  currentSheet().conditionalRule = null;
  save();
  refreshValues();
  refreshRuleForm();
});

const styleDialog = $("sheet-style-dialog");
const styleForm = styleDialog.querySelector("form");
styleForm.elements.font.add(new Option("Default", ""));
for (const font of spreadsheetFonts) styleForm.elements.font.add(new Option(font));
$("sheet-style-open").addEventListener("click", () => {
  const style = currentSheet().styles?.[selectedAddress] ?? {};
  const fields = styleForm.elements;
  $("sheet-style-range").value = selectedRange?.label || selectedAddress;
  for (const key of ["bold", "italic", "underline", "border"]) fields[key].checked = Boolean(style[key]);
  for (const key of ["font", "size", "align"]) fields[key].value = style[key] ?? "";
  fields.color.value = "#" + (style.color ?? "182035");
  fields.useFill.checked = Boolean(style.fill);
  fields.fill.value = "#" + (style.fill ?? "EDE8FF");
  styleDialog.showModal();
});
function applyAppearance(style) {
  recordEdit();
  const sheet = currentSheet();
  sheet.styles ??= {};
  for (const address of selectionAddresses()) {
    if (Object.keys(style).length) sheet.styles[address] = style;
    else delete sheet.styles[address];
  }
  save();
  styleDialog.close();
  refreshValues();
}
styleForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const { bold, italic, underline, border, font, size, align, color, useFill, fill } = styleForm.elements;
  applyAppearance(normalizeCellStyle({
    bold: bold.checked, italic: italic.checked, underline: underline.checked, border: border.checked,
    font: font.value, size: size.valueAsNumber, align: align.value,
    color: color.value.slice(1), fill: useFill.checked ? fill.value.slice(1) : "",
  }));
});
styleForm.querySelector("[data-clear]").addEventListener("click", () => applyAppearance({}));
styleForm.querySelector("[data-close]").addEventListener("click", () => styleDialog.close());

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

function selectRange(first, last) {
  const firstRow = Number(first.slice(1)) - 1;
  const lastRow = Number(last.slice(1)) - 1;
  const firstColumn = first.charCodeAt(0) - 65;
  const lastColumn = last.charCodeAt(0) - 65;
  selectedRange = first === last ? null : {
    firstRow: Math.min(firstRow, lastRow), lastRow: Math.max(firstRow, lastRow),
    firstColumn: Math.min(firstColumn, lastColumn), lastColumn: Math.max(firstColumn, lastColumn),
    label: `${first}:${last}`,
  };
  refreshFormula();
  refreshSelection();
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
  $("workbook-title").value = workbook.name;
  const sheet = currentSheet();
  chartForm.elements.range.value = sheet.chart?.range ?? "";
  selectedRange = null;
  if (!rulePanel.hidden) refreshRuleForm();
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
    button.textContent = sheetName(index);
    button.hidden = Boolean(_sheet.hidden);
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
grid.addEventListener("mousedown", (event) => {
  const address = event.target.dataset.cell;
  if (!address || event.button !== 0 || !event.shiftKey) return;
  event.preventDefault();
  const anchor = grid.querySelector(`[data-cell="${selectedAddress}"]`);
  if (!anchor || anchor.closest("tr").hidden) return;
  anchor.focus({ preventScroll: true });
  selectRange(selectedAddress, address);
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
const sortDialog = $("sheet-sort-dialog");
const sortForm = sortDialog.querySelector("form");
let deduplicate = false;
function openRecordTool(removeDuplicates) {
  deduplicate = removeDuplicates;
  $("sheet-sort-title").textContent = deduplicate ? "Remove duplicate records" : "Sort records";
  sortForm.querySelector("[type=submit]").textContent = deduplicate ? "Remove duplicate rows" : "Sort data rows";
  sortForm.querySelector("[data-sort-options]").hidden = deduplicate;
  sortForm.elements.column.disabled = deduplicate;
  const sheet = currentSheet();
  sortForm.elements.range.value = selectedRange?.label || `A1:${cellAddress(sheet.rows - 1, sheet.columns - 1)}`;
  sortForm.elements.column.value = selectedAddress[0];
  sortForm.querySelector("[role=status]").textContent = "";
  sortDialog.showModal();
}
$("sheet-sort").addEventListener("click", () => openRecordTool(false));
$("sheet-deduplicate").addEventListener("click", () => openRecordTool(true));
sortDialog.querySelector("[data-close]").addEventListener("click", () => sortDialog.close());
sortForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const { range, column, direction } = sortForm.elements;
  try {
    const sheet = currentSheet();
    const valueAt = workbookValues();
    let result;
    let message = "";
    if (deduplicate) {
      const { duplicates, records } = removeDuplicateRecords(sheet, range.value, valueAt);
      if (!duplicates) {
        sortForm.querySelector("[role=status]").textContent = "No duplicate records in this range.";
        return;
      }
      result = records;
      message = `${duplicates} duplicate ${duplicates === 1 ? "record" : "records"} removed.`;
    } else result = sortSheetRange(sheet, { range: range.value, column: column.value, direction: direction.value }, valueAt);
    recordEdit();
    Object.assign(sheet, result);
    save();
    sortDialog.close();
    refreshValues();
    refreshFormula();
    if (message) status(message);
  } catch (error) { sortForm.querySelector("[role=status]").textContent = error.message; }
});
const splitDialog = $("sheet-split-dialog");
const splitForm = splitDialog.querySelector("form");
$("sheet-split").addEventListener("click", () => {
  splitForm.elements.range.value = selectedRange?.label || selectedAddress;
  splitForm.querySelector("[role=status]").textContent = "";
  splitDialog.showModal();
});
splitForm.querySelector("[data-close]").addEventListener("click", () => splitDialog.close());
splitForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const { range, delimiter } = splitForm.elements;
  try {
    const changes = splitColumnText(currentSheet(), range.value, delimiter.value === "tab" ? "\t" : delimiter.value);
    if (!changes.length) throw new Error("No matching separators in the selected text.");
    applyCellChanges(changes);
    splitDialog.close();
    render();
  } catch (error) { splitForm.querySelector("[role=status]").textContent = error.message; }
});
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
  const query = name.value.trim().toUpperCase();
  const named = workbook.namedRanges?.find((entry) => entry.name.toUpperCase() === query);
  if (named) {
    const index = workbook.sheets.findIndex((sheet, position) => !sheet.hidden && sheetName(position).toUpperCase() === named.sheet.toUpperCase());
    if (index < 0) { status("Show the named range's worksheet first."); return; }
    if (index !== workbook.active) {
      workbook.active = index;
      save();
      render();
    }
  }
  const label = named?.range ?? query;
  const [first, last = first, extra] = label.split(":");
  const field = (address) => validAddress.test(address) && grid.querySelector(`[data-cell="${address}"]`);
  if (!field(first) || !field(last) || extra !== undefined || field(first).closest("tr").hidden) {
    status("Enter a visible cell, range, or named range.");
    return;
  }
  field(first).focus();
  selectRange(first, last);
});

const namesDialog = $("sheet-names-dialog");
const namesForm = namesDialog.querySelector("form");
const namesStatus = namesDialog.querySelector("[role=status]");
const { saved: namePicker, rangeName, worksheet: namedSheet, range: namedCells } = namesForm.elements;
const removeName = namesForm.querySelector("[data-remove]");
function expandNamedSheet(sheets, entry) {
  const sheet = sheets.find((item, index) => (item.name || `Sheet ${index + 1}`).toUpperCase() === entry.sheet.toUpperCase());
  if (!sheet) return false;
  const last = entry.range.split(":").at(-1);
  const rows = Math.max(sheet.rows, Number(last.slice(1)));
  const columns = Math.max(sheet.columns, last.charCodeAt(0) - 64);
  const expanded = rows !== sheet.rows || columns !== sheet.columns;
  Object.assign(sheet, { rows, columns });
  return expanded;
}
function renderNames(selected = "") {
  const ranges = workbook.namedRanges ?? [];
  namePicker.replaceChildren(new Option("New named range", ""), ...ranges.map((entry) => new Option(entry.name)));
  namePicker.value = selected;
  const entry = ranges.find(({ name }) => name === selected);
  rangeName.value = entry?.name ?? "";
  rangeName.readOnly = Boolean(entry);
  namedSheet.value = entry?.sheet ?? sheetName(workbook.active);
  namedCells.value = entry?.range ?? selectedRange?.label ?? selectedAddress;
  removeName.disabled = !entry;
}
$("sheet-named-ranges").addEventListener("click", () => {
  namedSheet.replaceChildren(...workbook.sheets.map((_, index) => new Option(sheetName(index))));
  namesStatus.textContent = "";
  renderNames();
  namesDialog.showModal();
});
namePicker.addEventListener("change", () => { namesStatus.textContent = ""; renderNames(namePicker.value); });
namesForm.querySelector("[data-close]").addEventListener("click", () => namesDialog.close());
namesForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const entry = normalizeNamedRange({ name: rangeName.value, sheet: namedSheet.value, range: namedCells.value });
  if (!entry) {
    namesStatus.textContent = "Enter a valid name and cell range. Names start with a letter or underscore and contain no spaces or cell references.";
    return;
  }
  const ranges = workbook.namedRanges ?? [];
  const existing = ranges.findIndex(({ name }) => name.toUpperCase() === entry.name.toUpperCase());
  if ((!namePicker.value && existing >= 0) || (existing < 0 && ranges.length >= 200)) {
    namesStatus.textContent = existing >= 0 ? "Select the existing name to change its range." : "This workbook already has 200 named ranges.";
    return;
  }
  recordEdit();
  if (existing < 0) ranges.push(entry);
  else ranges[existing] = entry;
  workbook.namedRanges = ranges;
  const expanded = expandNamedSheet(workbook.sheets, entry);
  save();
  if (expanded) render();
  else refreshValues();
  renderNames(entry.name);
  namesStatus.textContent = "Named range saved.";
});
removeName.addEventListener("click", () => {
  if (!namePicker.value) return;
  recordEdit();
  workbook.namedRanges = workbook.namedRanges.filter(({ name }) => name !== namePicker.value);
  save();
  refreshValues();
  renderNames();
  namesStatus.textContent = "Named range removed. Undo restores it.";
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
const functionDialog = $("sheet-function-dialog");
const functionQuery = $("sheet-function-query");
function filterFunctions() {
  const terms = functionQuery.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let count = 0;
  for (const example of $("sheet-function-examples").children) {
    const description = example.textContent.toLowerCase();
    example.hidden = !terms.every((term) => description.includes(term));
    if (!example.hidden) count++;
  }
  $("sheet-function-count").textContent = !terms.length ? "" :
    count === 0 ? "No matching functions." : `${count} ${count === 1 ? "match" : "matches"}`;
}
$("sheet-function-help").addEventListener("click", () => {
  functionQuery.value = "";
  filterFunctions();
  functionDialog.showModal();
});
functionQuery.addEventListener("input", filterFunctions);
functionDialog.querySelector("form").addEventListener("submit", (event) => event.preventDefault());
$("sheet-function-close").addEventListener("click", () => functionDialog.close());
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
    return [sheet.cells[address] ?? "", displayCell(valueAt(address), sheet.formats?.[address], undefined, workbook.date1904)]
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
  if (!["Enter", "ArrowUp", "ArrowDown"].includes(event.key) || !address || event.isComposing ||
      event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  const extend = event.shiftKey && event.key !== "Enter";
  const edge = extend ? selectedRange?.label.split(":")[1] ?? address : address;
  const direction = event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey) ? -1 : 1;
  for (let row = Number(edge.slice(1)) + direction; row > 0 && row <= currentSheet().rows; row += direction) {
    const field = grid.querySelector(`[data-cell="${edge[0]}${row}"]`);
    if (field.closest("tr").hidden) continue;
    if (extend) {
      selectRange(address, field.dataset.cell);
      field.scrollIntoView({ block: "nearest", inline: "nearest" });
    } else field.focus();
    break;
  }
});
$("sheet-add").addEventListener("click", () => {
  recordEdit();
  const name = uniqueName(`Sheet ${workbook.sheets.length + 1}`);
  workbook.active = workbook.sheets.push({ ...blankSheet(), name }) - 1;
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
const csvDialog = $("sheet-csv-dialog");
const csvForm = csvDialog.querySelector("form");
let csvPreviewRequested = false;
let csvSource = "";
let csvRows;
function appendCsv(rows) {
  if (workbook.sheets.length >= maxSheets) throw new Error("The workbook already contains 12 sheets.");
  const sheet = { ...blankSheet(), name: uniqueName(`Sheet ${workbook.sheets.length + 1}`) };
  sheet.rows = Math.max(sheet.rows, rows.length);
  for (const [row, fields] of rows.entries()) {
    sheet.columns = Math.max(sheet.columns, fields.length);
    fields.forEach((value, column) => { if (value) sheet.cells[cellAddress(row, column)] = value; });
  }
  recordEdit();
  workbook.active = workbook.sheets.push(sheet) - 1;
  save();
  render();
}
function renderCsvPreview() {
  const message = csvForm.querySelector("[role=status]");
  const table = csvForm.querySelector("table");
  const submit = csvForm.querySelector("[type=submit]");
  table.replaceChildren();
  csvRows = undefined;
  submit.disabled = true;
  try {
    const value = csvForm.elements.delimiter.value;
    csvRows = parseCsv(csvSource, value === "tab" ? "\t" : value);
    if (!csvRows.length) throw new Error("This file contains no records.");
    const columns = Math.max(...csvRows.map((row) => row.length));
    message.textContent = `${csvRows.length} rows · ${columns} columns${csvRows.length > 8 ? " · First 8 shown" : ""}`;
    const body = table.createTBody();
    for (const row of csvRows.slice(0, 8)) {
      const line = body.insertRow();
      for (const value of row) line.insertCell().textContent = value;
    }
    submit.disabled = false;
  } catch (error) { message.textContent = error.message; }
}
csvForm.elements.delimiter.addEventListener("change", renderCsvPreview);
csvForm.querySelector("[data-close]").addEventListener("click", () => csvDialog.close());
csvDialog.addEventListener("close", () => { csvSource = ""; csvRows = undefined; });
csvForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!csvRows?.length) return;
  try {
    appendCsv(csvRows);
    csvDialog.close();
  } catch (error) { csvForm.querySelector("[role=status]").textContent = error.message; }
});
$("sheet-open").addEventListener("click", () => { csvPreviewRequested = false; $("sheet-file").click(); });
$("sheet-open-preview").addEventListener("click", () => { csvPreviewRequested = true; $("sheet-file").click(); });
$("sheet-file").addEventListener("cancel", () => { csvPreviewRequested = false; });
$("sheet-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  const preview = csvPreviewRequested;
  csvPreviewRequested = false;
  event.target.value = "";
  if (!file) return;
  if (workbook.sheets.length >= maxSheets) { status("The workbook already contains 12 sheets."); return; }
  if (file.size > 1024 * 1024) { status("Choose a CSV file under 1 MB."); return; }
  try {
    const text = (await file.text()).replace(/^\uFEFF/, "");
    if (preview) {
      csvSource = text;
      renderCsvPreview();
      csvDialog.showModal();
    } else {
      appendCsv(parseCsv(text));
    }
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
    const { sheets, date1904, namedRanges } = importWorkbook(new Uint8Array(await file.arrayBuffer()), window.fflate);
    const emptyWorkbook = workbook.sheets.length === 1 && !Object.keys(workbook.sheets[0].cells).length && !workbook.namedRanges?.length;
    const existing = emptyWorkbook ? [] : workbook.sheets;
    if (existing.length && date1904 !== Boolean(workbook.date1904)) {
      status("This file uses a different date system. Open it in a new workbook.");
      return;
    }
    if (existing.length + sheets.length > maxSheets) { status("The import would exceed the workbook’s 12-sheet limit."); return; }
    const existingNames = existing.length ? workbook.namedRanges ?? [] : [];
    const defined = new Set(existingNames.map(({ name }) => name.toUpperCase()));
    if (namedRanges.some(({ name }) => defined.has(name.toUpperCase())) || existingNames.length + namedRanges.length > 200) {
      status("The incoming workbook has conflicting or too many named ranges. Open it in a new workbook.");
      return;
    }
    const used = new Set(existing.map((_, index) => sheetName(index).toUpperCase()));
    const renamed = new Map();
    for (const [index, sheet] of sheets.entries()) {
      const original = sheet.name || `Sheet ${index + 1}`;
      sheet.name = uniqueName(original, used);
      used.add(sheet.name.toUpperCase());
      if (sheet.name !== original) renamed.set(original.toUpperCase(), sheet.name);
    }
    if (renamed.size) for (const sheet of sheets) {
      for (const address of Object.keys(sheet.cells)) sheet.cells[address] = renameSheetReferences(sheet.cells[address], renamed);
    }
    const importedNames = namedRanges.map((entry) => ({ ...entry, sheet: renamed.get(entry.sheet.toUpperCase()) ?? entry.sheet }));
    for (const entry of importedNames) expandNamedSheet(sheets, entry);
    recordEdit();
    const firstVisible = sheets.findIndex((sheet) => !sheet.hidden);
    if (firstVisible < 0) sheets[0].hidden = false;
    for (const sheet of sheets) if (sheet.pivot) sheet.pivot.source += existing.length;
    workbook = {
      name: existing.length ? workbook.name : file.name.replace(/\.xlsx$/i, "").slice(0, 100),
      active: existing.length + Math.max(0, firstVisible), sheets: [...existing, ...sheets], date1904,
      namedRanges: [...existingNames, ...importedNames],
    };
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
    const name = workbook.name.trim().replace(/[\\/:*?"<>|]/g, "-") || defaultWorkbookName;
    const staticPivots = [];
    const bytes = exportWorkbook(workbook.sheets, window.fflate, workbook.date1904, workbook.namedRanges, (name) => staticPivots.push(name));
    download(bytes, xlsxMime, name + ".xlsx");
    if (staticPivots.length) status(`Exported. Static pivot summaries: ${staticPivots.join(", ")}. Refresh the summaries and check the source headers before exporting again.`);
  } catch {
    status("The Excel workbook could not be exported.");
  }
});

$("workbook-title").addEventListener("change", (event) => {
  const name = event.target.value.trim() || defaultWorkbookName;
  event.target.value = name;
  if (name === workbook.name) return;
  recordEdit();
  workbook.name = name;
  save();
});
$("workbook-save").addEventListener("click", save);
$("workbook-new").addEventListener("click", () => {
  if ((workbook.name !== defaultWorkbookName || workbook.sheets.length > 1 || Object.keys(currentSheet().cells).length) &&
    !window.confirm("Start a new workbook? Download a copy first if you want to keep this one.")) return;
  recordEdit();
  workbook = { name: defaultWorkbookName, active: 0, sheets: [blankSheet()] };
  selectedAddress = "A1";
  save();
  render();
  $("workbook-title").focus();
});

const manageDialog = $("sheet-manage-dialog");
const manageForm = manageDialog.querySelector("form");
const managedSheet = manageForm.elements.sheet;
const manageStatus = manageForm.querySelector("[role=status]");

function manageButton(action) { return manageForm.querySelector(`[data-manage="${action}"]`); }

function renderManagement(index = Number(managedSheet.value)) {
  managedSheet.replaceChildren(...workbook.sheets.map((sheet, position) => new Option(
    sheetName(position) + (sheet.hidden ? " (hidden)" : ""), position,
  )));
  managedSheet.value = index;
  const sheet = workbook.sheets[index];
  const visible = workbook.sheets.filter((item) => !item.hidden).length;
  manageForm.elements.label.value = sheetName(index);
  manageButton("duplicate").disabled = workbook.sheets.length >= maxSheets;
  manageButton("earlier").disabled = index === 0;
  manageButton("later").disabled = index === workbook.sheets.length - 1;
  manageButton("visibility").textContent = sheet.hidden ? "Unhide" : "Hide";
  manageButton("visibility").disabled = !sheet.hidden && visible < 2;
  manageButton("delete").disabled = !sheet.hidden && visible < 2;
}

function finishManagement(index) {
  save();
  render();
  renderManagement(index);
}

$("sheet-manage").addEventListener("click", () => {
  manageStatus.textContent = "";
  renderManagement(workbook.active);
  manageDialog.showModal();
});
managedSheet.addEventListener("change", () => renderManagement());
manageForm.querySelector("[data-close]").addEventListener("click", () => manageDialog.close());
manageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const index = Number(managedSheet.value);
  const previous = sheetName(index);
  const name = manageForm.elements.label.value.trim();
  if (!name || name.length > 31 || /[\\/:?*\[\]]/.test(name) || /^'|'$/.test(name) ||
    workbook.sheets.some((_, position) => position !== index && sheetName(position).toUpperCase() === name.toUpperCase())) {
    manageStatus.textContent = "Enter a unique Excel sheet name without brackets, slashes, colons, question marks or asterisks.";
    return;
  }
  if (name === previous) return;
  recordEdit();
  workbook.sheets[index].name = name;
  const names = new Map([[previous.toUpperCase(), name]]);
  for (const entry of workbook.namedRanges ?? []) {
    if (entry.sheet.toUpperCase() === previous.toUpperCase()) entry.sheet = name;
  }
  for (const sheet of workbook.sheets) {
    for (const address of Object.keys(sheet.cells)) sheet.cells[address] = renameSheetReferences(sheet.cells[address], names);
  }
  manageStatus.textContent = "Sheet renamed.";
  finishManagement(index);
});

function sheetMutation(action) {
  const index = Number(managedSheet.value);
  const sheet = workbook.sheets[index];
  const current = currentSheet();
  if (action === "delete" && !window.confirm(`Delete ${sheetName(index)}? Use Undo to restore it before closing the workbook.`)) return;
  recordEdit();
  const before = [...workbook.sheets];
  for (const [position, item] of before.entries()) item.name ||= `Sheet ${position + 1}`;
  if (action === "duplicate") {
    workbook.sheets.push({ ...structuredClone(sheet), name: uniqueName(sheet.name + " copy"), hidden: false });
    workbook.active = workbook.sheets.length - 1;
    finishManagement(workbook.active);
    return;
  }
  if (action === "visibility") sheet.hidden = !sheet.hidden;
  if (action === "delete") {
    workbook.namedRanges = (workbook.namedRanges ?? []).filter((entry) => entry.sheet.toUpperCase() !== sheet.name.toUpperCase());
    workbook.sheets.splice(index, 1);
  }
  if (action === "earlier" || action === "later") {
    const target = index + (action === "earlier" ? -1 : 1);
    [workbook.sheets[index], workbook.sheets[target]] = [workbook.sheets[target], workbook.sheets[index]];
  }
  workbook.active = workbook.sheets.indexOf(current);
  if (workbook.active < 0 || current.hidden) workbook.active = workbook.sheets.findIndex((item) => !item.hidden);
  for (const item of workbook.sheets) {
    if (item.pivot) item.pivot.source = workbook.sheets.indexOf(before[item.pivot.source]);
  }
  const destination = workbook.sheets.indexOf(sheet);
  finishManagement(destination < 0 ? workbook.active : destination);
}
for (const button of manageForm.querySelectorAll("[data-manage]")) {
  button.addEventListener("click", () => sheetMutation(button.dataset.manage));
}

bindSheetPrinting({
  activeSheet: currentSheet,
  activeWorkbook: () => workbook,
  selection: () => selectedRange?.label || "",
  change: (settings) => {
    recordEdit();
    currentSheet().print = settings;
    save();
  },
});

render();
