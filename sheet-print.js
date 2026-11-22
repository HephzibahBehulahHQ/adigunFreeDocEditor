import { calculateWorkbook, cellAddress, conditionalFill, displayCell, hiddenFilterRows, normalizePrintSettings } from "./sheet-model.js";

export function bindSheetPrinting({ activeSheet, activeWorkbook, selection, change }) {
  const $ = (id) => document.getElementById(id);
  const dialog = $("sheet-print-dialog");
  const form = dialog.querySelector("form");
  const error = form.querySelector("[role=status]");
  const output = $("sheet-print-layout");
  function chosenSettings() {
    const { range, paper, orientation, grid, repeat } = form.elements;
    const settings = normalizePrintSettings({
      range: range.value.trim(), paper: paper.value, orientation: orientation.value, grid: grid.checked, repeat: repeat.checked,
    });
    if (range.value.trim() && !settings.range) throw new Error("Enter a range such as A1:F25.");
    const last = settings.range.split(":").at(-1);
    const sheet = activeSheet();
    if (last && (Number(last.slice(1)) > sheet.rows || last.charCodeAt(0) - 64 > sheet.columns)) {
      throw new Error("The print range exceeds the sheet.");
    }
    return settings;
  }
  $("sheet-print-settings").addEventListener("click", () => {
    const settings = normalizePrintSettings(activeSheet().print);
    for (const key of ["range", "paper", "orientation"]) form.elements[key].value = settings[key];
    if (!settings.range) form.elements.range.value = selection();
    for (const key of ["grid", "repeat"]) form.elements[key].checked = settings[key];
    error.textContent = "";
    dialog.showModal();
  });
  form.querySelector("[data-close]").addEventListener("click", () => dialog.close());
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      change(chosenSettings());
      dialog.close();
      if (event.submitter?.dataset.preview !== undefined) window.print();
    } catch (reason) { error.textContent = reason.message; }
  });
  $("workbook-print").addEventListener("click", () => window.print());

  window.addEventListener("beforeprint", () => {
    const workbook = activeWorkbook();
    const sheet = activeSheet();
    const settings = normalizePrintSettings(sheet.print);
    const values = calculateWorkbook(workbook.sheets, workbook.active, workbook.date1904);
    const fillAt = conditionalFill(sheet.conditionalRule);
    const hidden = hiddenFilterRows(sheet.filter, values);
    const addresses = Object.keys(sheet.cells);
    const lastUsedRow = Math.max(1, ...addresses.map((address) => Number(address.slice(1))));
    const lastUsedColumn = Math.max(1, ...addresses.map((address) => address.charCodeAt(0) - 64));
    const [start, end = start] = settings.range.split(":");
    const firstRow = start ? Number(start.slice(1)) : 1;
    const lastRow = end ? Number(end.slice(1)) : lastUsedRow;
    const firstColumn = start ? start.charCodeAt(0) - 65 : 0;
    const lastColumn = end ? end.charCodeAt(0) - 65 : lastUsedColumn - 1;
    output.dataset.paper = settings.paper;
    output.dataset.orientation = settings.orientation;
    const title = document.createElement("h1");
    title.textContent = workbook.name + " · " + (sheet.name || `Sheet ${workbook.active + 1}`);
    const table = document.createElement("table");
    table.classList.toggle("sheet-print-gridlines", settings.grid);
    const heading = settings.repeat ? table.createTHead() : null;
    const body = table.createTBody();
    for (let row = firstRow; row <= lastRow; row++) {
      if (hidden.has(row)) continue;
      const line = (row === firstRow && heading ? heading : body).insertRow();
      for (let column = firstColumn; column <= lastColumn; column++) {
        const address = cellAddress(row - 1, column);
        const cell = line.insertCell();
        const value = values(address);
        cell.textContent = displayCell(value, sheet.formats?.[address], undefined, workbook.date1904);
        const style = sheet.styles?.[address] ?? {};
        const fill = fillAt(address, value) || style.fill;
        if (fill) cell.style.background = "#" + fill;
        if (style.color) cell.style.color = "#" + style.color;
        if (style.font) cell.style.fontFamily = style.font;
        if (style.size) cell.style.fontSize = style.size + "pt";
        if (style.bold) cell.style.fontWeight = "bold";
        if (style.italic) cell.style.fontStyle = "italic";
        if (style.underline) cell.style.textDecoration = "underline";
        if (style.align) cell.style.textAlign = style.align;
        if (style.border) cell.style.border = "1px solid #75839c";
      }
    }
    output.replaceChildren(title, table);
  });
}
