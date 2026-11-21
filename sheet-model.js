export const maxRows = 100;
export const maxColumns = 26;
export const maxCellLength = 4000;
export const numberFormats = { general: 0, number: 4, percent: 10, decimal: 2 };
export const conditionalColors = { yellow: "FFF3B8", green: "D6F3DE", red: "FFDDE3" };

export function normalizeConditionalRule(input) {
  const { range, operator, threshold, color } = input ?? {};
  if (typeof range !== "string" || !["greaterThan", "lessThan", "equal"].includes(operator) ||
    !Number.isFinite(threshold) || !Object.hasOwn(conditionalColors, color)) return null;
  const match = /^([A-Z])([1-9]\d?|100)(?::([A-Z])([1-9]\d?|100))?$/.exec(range.toUpperCase().trim());
  if (!match) return null;
  const [, left, top, right = left, bottom = top] = match;
  if (right < left || Number(bottom) < Number(top)) return null;
  return { range: match[0], operator, threshold, color };
}

export function conditionalFill(rule) {
  if (!rule) return () => "";
  const [first, last = first] = rule.range.split(":");
  return (address, value) => {
    if (address[0] < first[0] || address[0] > last[0] || Number(address.slice(1)) < Number(first.slice(1)) ||
      Number(address.slice(1)) > Number(last.slice(1)) || !String(value).trim() || !Number.isFinite(Number(value))) return "";
    const number = Number(value);
    const match = rule.operator === "greaterThan" ? number > rule.threshold :
      rule.operator === "lessThan" ? number < rule.threshold : number === rule.threshold;
    return match ? conditionalColors[rule.color] : "";
  };
}

export function validationOptions(value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" ||
    !item || /[",\r\n]/.test(item) || /^[=']/.test(item))) return [];
  const options = [...new Set(value)];
  return options.join(",").length <= 253 ? options : [];
}

export function parseSheetFilter(input) {
  const { range, column, value } = input ?? {};
  if (typeof range !== "string" || typeof column !== "string" || typeof value !== "string" ||
    !value || value.length > 255) return null;
  const match = /^([A-Z])([1-9]\d?|100):([A-Z])([1-9]\d?|100)$/.exec(range.toUpperCase().trim());
  if (!match) return null;
  const [, left, first, right, last] = match;
  const key = column.toUpperCase().trim();
  if (!/^[A-Z]$/.test(key) || key < left || key > right || Number(last) <= Number(first)) return null;
  return { range: match[0], column: key, value };
}

export function hiddenFilterRows(filter, valueAt) {
  if (!filter) return new Set();
  const [, first, last] = /^[A-Z](\d+):[A-Z](\d+)$/.exec(filter.range);
  const hidden = new Set();
  for (let row = Number(first) + 1; row <= Number(last); row++) {
    if (String(valueAt(filter.column + row)).toUpperCase() !== filter.value.toUpperCase()) hidden.add(row);
  }
  return hidden;
}

export function sortSheetRange(sheet, { range, column, direction }, valueAt) {
  const target = parseSheetFilter({ range, column, value: "sort" });
  if (!target || !["asc", "desc"].includes(direction)) throw new Error("Choose a header row, data rows and a sort column.");
  const [start, end] = target.range.split(":");
  const first = Number(start.slice(1));
  const last = Number(end.slice(1));
  if (last > sheet.rows || end.charCodeAt(0) - 64 > sheet.columns) throw new Error("Choose a range within this sheet.");
  const left = start.charCodeAt(0) - 65;
  const right = end.charCodeAt(0) - 65;
  const rows = Array.from({ length: last - first }, (_, index) => first + index + 1);
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const numeric = (value) => typeof value === "number" || typeof value === "string" &&
    /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) && Number.isFinite(Number(value));
  const values = new Map(rows.map((row) => [row, valueAt(target.column + row)]));
  const compare = (a, b) => {
    if (a === "" || b === "") return Number(a === "") - Number(b === "");
    let difference;
    if (numeric(a) && numeric(b)) difference = Number(a) - Number(b);
    else if (numeric(a) !== numeric(b)) difference = numeric(a) ? -1 : 1;
    else difference = collator.compare(String(a), String(b));
    return direction === "asc" ? difference : -difference;
  };
  const order = rows.slice().sort((a, b) => compare(values.get(a), values.get(b)));
  const result = {};
  for (const key of ["cells", "formats", "validation"]) result[key] = { ...sheet[key] };
  for (const [offset, sourceRow] of order.entries()) {
    const targetRow = rows[offset];
    for (let index = left; index <= right; index++) {
      const source = cellAddress(sourceRow - 1, index);
      const destination = cellAddress(targetRow - 1, index);
      for (const key of ["cells", "formats", "validation"]) {
        const value = sheet[key]?.[source];
        if (value === undefined) delete result[key][destination];
        else result[key][destination] = key === "cells" ? shiftCellFormula(value, targetRow - sourceRow, 0) : value;
      }
    }
  }
  return result;
}

export function parseChartRange(range = "") {
  if (typeof range !== "string") return null;
  const match = /^([A-Z])([1-9]\d?|100):([A-Z])([1-9]\d?|100)$/.exec(range.toUpperCase().trim());
  if (!match) return null;
  const [, labels, first, values, last] = match;
  if (values.charCodeAt(0) - labels.charCodeAt(0) !== 1 || Number(last) <= Number(first)) return null;
  return { range: match[0], labels, values, first: Number(first), last: Number(last) };
}

export function chartValues(chart, valueAt) {
  const values = [];
  for (let row = chart.first + 1; row <= chart.last; row++) {
    const raw = String(valueAt(chart.values + row)).trim();
    if (!raw || !Number.isFinite(Number(raw))) continue;
    const label = String(valueAt(chart.labels + row)).trim();
    values.push({ label: label || `Row ${row}`, value: Number(raw) });
  }
  return values;
}

export function displayCell(value, format, locale) {
  if (!Object.hasOwn(numberFormats, format) || format === "general") return value;
  const numeric = typeof value === "number" || (typeof value === "string" && /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim()));
  if (!numeric || !Number.isFinite(Number(value))) return value;
  return new Intl.NumberFormat(locale, {
    style: format === "percent" ? "percent" : "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: format !== "decimal",
  }).format(Number(value));
}

export function parseCsv(source, delimiter = ",") {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let quoteClosed = false;
  const finishField = () => {
    if (row.length >= maxColumns || field.length > maxCellLength) throw new Error("CSV exceeds the sheet’s column or cell limit.");
    row.push(field);
    field = "";
    quoteClosed = false;
  };
  const finishRow = () => {
    if (rows.length >= maxRows) throw new Error("CSV exceeds the 100-row limit.");
    finishField();
    rows.push(row);
    row = [];
  };
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { field += '"'; index++; }
      else if (character === '"') { quoted = false; quoteClosed = true; }
      else field += character;
    } else if (character === delimiter) finishField();
    else if (character === "\r" || character === "\n") {
      if (character === "\r" && source[index + 1] === "\n") index++;
      finishRow();
    } else if (character === '"' && !field && !quoteClosed) quoted = true;
    else if (quoteClosed || character === '"') throw new Error("CSV contains an invalid quoted field.");
    else field += character;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  if (field || row.length || quoteClosed) finishRow();
  return rows;
}

export function cellAddress(row, column) {
  return String.fromCharCode(65 + column) + (row + 1);
}

export function shiftCellFormula(value, rowDelta, columnDelta) {
  if (!value.startsWith("=")) return value;
  return value.replace(/(?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!\$?[A-Za-z]\$?\d+|\$?[A-Za-z]\$?\d+|[A-Za-z_][\w.]*|"(?:[^"]|"")*"/g, (token) => {
    const separator = token.lastIndexOf("!") + 1;
    const match = /^(\$?)([A-Za-z])(\$?)([1-9]\d?|100)$/.exec(token.slice(separator));
    if (!match) return token;
    const [, absoluteColumn, letter, absoluteRow, digits] = match;
    const column = letter.toUpperCase().charCodeAt(0) - 65 + (absoluteColumn ? 0 : columnDelta);
    const row = Number(digits) - 1 + (absoluteRow ? 0 : rowDelta);
    if (column < 0 || column >= maxColumns || row < 0 || row >= maxRows) return "#REF!";
    const address = cellAddress(row, column);
    return token.slice(0, separator) + absoluteColumn + address[0] + absoluteRow + address.slice(1);
  });
}

export function renameSheetReferences(value, names) {
  if (!value.startsWith("=")) return value;
  return value.replace(/"(?:[^"]|"")*"|('(?:[^']|'')+'|[A-Za-z_][\w.]*)!(?=\$?[A-Za-z]\$?\d+)/g, (part, name) => {
    const key = name?.replace(/^'|'$/g, "").replaceAll("''", "'").toUpperCase();
    const replacement = names.get(key);
    return replacement ? "'" + replacement.replaceAll("'", "''") + "'!" : part;
  });
}

export function buildPivot(cells, { range, group, measure, aggregate }, valueAt = calculateSheet(cells)) {
  const match = /^([A-Z])([1-9]\d?|100):([A-Z])([1-9]\d?|100)$/.exec(range.toUpperCase().trim());
  if (!match) throw new Error("Enter a source range such as A1:D20, including the header row.");
  const [, left, first, right, last] = match;
  const groupColumn = group.toUpperCase().trim();
  const valueColumn = measure.toUpperCase().trim();
  const inRange = (column) => /^[A-Z]$/.test(column) && column >= left && column <= right;
  if (+first >= +last || !inRange(groupColumn) || !inRange(valueColumn) || !["sum", "count", "average"].includes(aggregate)) {
    throw new Error("Choose a header row, data rows, and columns within the source range.");
  }
  const groups = new Map();
  for (let row = +first + 1; row <= +last; row++) {
    const label = valueAt(groupColumn + row);
    const value = valueAt(valueColumn + row);
    if (label === "") continue;
    if (!groups.has(label)) groups.set(label, { sum: 0, count: 0 });
    const bucket = groups.get(label);
    if (aggregate === "count") { if (value !== "") bucket.count++; continue; }
    if (value === "" || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(String(value).trim())) continue;
    const number = Number(value);
    if (!Number.isFinite(number)) continue;
    bucket.sum += number;
    bucket.count++;
  }
  const literal = (value) => /^[=']/.test(String(value)) ? "'" + value : String(value);
  const result = {
    A1: literal(valueAt(groupColumn + first) || groupColumn),
    B1: literal(aggregate.toUpperCase() + " of " + (valueAt(valueColumn + first) || valueColumn)),
  };
  let row = 2;
  for (const [label, { sum, count }] of groups) {
    result["A" + row] = literal(label);
    const value = aggregate === "count" ? count : aggregate === "average" && count ? sum / count : sum;
    result["B" + row++] = Number.isFinite(value) ? String(value) : "#VALUE!";
  }
  return { cells: result, rows: Math.max(20, row - 1), columns: 8 };
}

export function calculateSheet(cells) {
  return calculateWorkbook([{ cells }], 0);
}

export function calculateWorkbook(sheets, active) {
  const computed = new Map();
  const visiting = new Set();
  const names = new Map();
  for (const [index, sheet] of sheets.entries()) {
    const name = (sheet.name || `Sheet ${index + 1}`).toUpperCase();
    if (!names.has(name)) names.set(name, index);
  }
  const numeric = (value) => {
    if (value === "") return 0;
    if (typeof value === "number") return value;
    if (/^#(?:CYCLE|ERROR|VALUE|REF|DIV\/0)!$/.test(value)) throw new Error(value);
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) throw new Error("#VALUE!");
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error("#VALUE!");
    return number;
  };
  const valueAt = (sheetIndex, address) => {
    if (sheetIndex === undefined) throw new Error("#REF!");
    const key = `${sheetIndex}:${address}`;
    if (computed.has(key)) return computed.get(key);
    if (visiting.has(key)) throw new Error("#CYCLE!");
    const raw = sheets[sheetIndex].cells[address] ?? "";
    if (!raw.startsWith("=")) return raw.startsWith("'") ? raw.slice(1) : raw;
    visiting.add(key);
    let value;
    try {
      value = evaluateFormula(raw.slice(1), (cell, sheet) =>
        valueAt(sheet === undefined ? sheetIndex : names.get(sheet.toUpperCase()), cell), numeric);
      if (!Number.isFinite(value)) value = "#DIV/0!";
    } catch (error) {
      value = /^#(?:CYCLE|VALUE|REF|DIV\/0)!$/.test(error.message) ? error.message : "#ERROR!";
    } finally {
      visiting.delete(key);
    }
    computed.set(key, value);
    return value;
  };
  return (address) => valueAt(active, address);
}

function evaluateFormula(expression, valueAt, numeric) {
  const tokens = expression.match(/#REF!|(?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!\$?[A-Za-z]\$?\d+|\$?[A-Za-z]\$?\d+|\d+(?:\.\d*)?|\.\d+|[A-Za-z]+|[()+*/,:-]|[^\s]/g) ?? [];
  if (tokens.includes("#REF!")) throw new Error("#REF!");
  if (tokens.length > 200) throw new Error("Formula is too long.");
  let index = 0;
  const take = (token) => tokens[index] === token && Boolean(++index);
  function reference(token = "") {
    const separator = token.lastIndexOf("!");
    const address = token.slice(separator + 1).replaceAll("$", "").toUpperCase();
    if (!/^[A-Z](?:[1-9]\d?|100)$/.test(address)) return null;
    const sheet = separator < 0 ? undefined : token.slice(0, separator).replace(/^'|'$/g, "").replaceAll("''", "'");
    return { address, sheet };
  }
  function term() {
    if (take("-")) return -term();
    if (take("+")) return term();
    if (take("(")) {
      const value = sum();
      if (!take(")")) throw new Error("Unclosed parenthesis.");
      return value;
    }
    const token = tokens[index++]?.toUpperCase();
    const cell = reference(token);
    if (cell) return numeric(valueAt(cell.address, cell.sheet));
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) return Number(token);
    if (!["SUM", "AVERAGE", "MIN", "MAX"].includes(token) || !take("(")) throw new Error("Unknown formula.");
    const values = [];
    do {
      const start = reference(tokens[index]);
      if (start && tokens[index + 1] === ":") {
        const end = reference(tokens[index + 2]);
        if (!end || (end.sheet && end.sheet.toUpperCase() !== start.sheet?.toUpperCase())) throw new Error("Invalid range.");
        const { address: first, sheet } = start;
        const last = end.address;
        index += 3;
        for (let row = Math.min(+first.slice(1), +last.slice(1)); row <= Math.max(+first.slice(1), +last.slice(1)); row++) {
          for (let column = Math.min(first.charCodeAt(0), last.charCodeAt(0)); column <= Math.max(first.charCodeAt(0), last.charCodeAt(0)); column++) {
            const value = valueAt(String.fromCharCode(column) + row, sheet);
            if (value !== "") values.push(numeric(value));
          }
        }
      } else values.push(sum());
    } while (take(","));
    if (!take(")")) throw new Error("Unclosed function.");
    if (token === "MIN") return values.length ? Math.min(...values) : 0;
    if (token === "MAX") return values.length ? Math.max(...values) : 0;
    const total = values.reduce((result, value) => result + value, 0);
    return token === "AVERAGE" ? total / values.length : total;
  }
  function product() {
    let value = term();
    while (["*", "/"].includes(tokens[index])) {
      const operator = tokens[index++];
      const right = term();
      if (operator === "/" && right === 0) throw new Error("#DIV/0!");
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }
  function sum() {
    let value = product();
    while (["+", "-"].includes(tokens[index])) {
      const operator = tokens[index++];
      const right = product();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }
  const value = sum();
  if (index !== tokens.length) throw new Error("Unexpected formula tokens.");
  return value;
}

export function toCsv(cells, valueAt = calculateSheet(cells)) {
  const addresses = Object.keys(cells);
  if (!addresses.length) return "";
  const rows = Math.max(...addresses.map((address) => +address.slice(1)));
  const columns = Math.max(...addresses.map((address) => address.charCodeAt(0) - 64));
  return Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => {
    const value = valueAt(cellAddress(row, column));
    const text = typeof value === "string" && /^\s*[=+@-]/.test(value) && !/^[+-]?\d+(?:\.\d+)?$/.test(value.trim()) ? "'" + value : String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  }).join(",")).join("\r\n");
}
