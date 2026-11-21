export const maxRows = 100;
export const maxColumns = 26;
export const maxCellLength = 4000;
export const numberFormats = { general: 0, number: 4, percent: 10 };

export function displayCell(value, format, locale) {
  if (!Object.hasOwn(numberFormats, format) || format === "general") return value;
  const numeric = typeof value === "number" || (typeof value === "string" && /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim()));
  if (!numeric || !Number.isFinite(Number(value))) return value;
  return new Intl.NumberFormat(locale, {
    style: format === "percent" ? "percent" : "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

export function buildPivot(cells, { range, group, measure, aggregate }) {
  const match = /^([A-Z])([1-9]\d?|100):([A-Z])([1-9]\d?|100)$/.exec(range.toUpperCase().trim());
  if (!match) throw new Error("Enter a source range such as A1:D20, including the header row.");
  const [, left, first, right, last] = match;
  const groupColumn = group.toUpperCase().trim();
  const valueColumn = measure.toUpperCase().trim();
  const inRange = (column) => /^[A-Z]$/.test(column) && column >= left && column <= right;
  if (+first >= +last || !inRange(groupColumn) || !inRange(valueColumn) || !["sum", "count", "average"].includes(aggregate)) {
    throw new Error("Choose a header row, data rows, and columns within the source range.");
  }
  const valueAt = calculateSheet(cells);
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
  const computed = new Map();
  const visiting = new Set();
  const numeric = (value) => {
    if (value === "") return 0;
    if (typeof value === "number") return value;
    if (/^#(?:CYCLE|ERROR|VALUE|DIV\/0)!$/.test(value)) throw new Error(value);
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) throw new Error("#VALUE!");
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error("#VALUE!");
    return number;
  };
  const valueAt = (address) => {
    if (computed.has(address)) return computed.get(address);
    if (visiting.has(address)) throw new Error("#CYCLE!");
    const raw = cells[address] ?? "";
    if (!raw.startsWith("=")) return raw.startsWith("'") ? raw.slice(1) : raw;
    visiting.add(address);
    let value;
    try {
      value = evaluateFormula(raw.slice(1), valueAt, numeric);
      if (!Number.isFinite(value)) value = "#DIV/0!";
    } catch (error) {
      value = /^#(?:CYCLE|VALUE|DIV\/0)!$/.test(error.message) ? error.message : "#ERROR!";
    } finally {
      visiting.delete(address);
    }
    computed.set(address, value);
    return value;
  };
  return valueAt;
}

function evaluateFormula(expression, valueAt, numeric) {
  const tokens = expression.toUpperCase().match(/\d+(?:\.\d*)?|\.\d+|[A-Z]+\d*|[()+*/,:-]|[^\s]/g) ?? [];
  if (tokens.length > 200) throw new Error("Formula is too long.");
  let index = 0;
  const take = (token) => tokens[index] === token && Boolean(++index);
  const addressPattern = /^[A-Z](?:[1-9]\d?|100)$/;
  function term() {
    if (take("-")) return -term();
    if (take("+")) return term();
    if (take("(")) {
      const value = sum();
      if (!take(")")) throw new Error("Unclosed parenthesis.");
      return value;
    }
    const token = tokens[index++];
    if (addressPattern.test(token)) return numeric(valueAt(token));
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) return Number(token);
    if (!["SUM", "AVERAGE", "MIN", "MAX"].includes(token) || !take("(")) throw new Error("Unknown formula.");
    const values = [];
    do {
      if (addressPattern.test(tokens[index]) && tokens[index + 1] === ":") {
        const first = tokens[index];
        const last = tokens[index + 2];
        if (!addressPattern.test(last)) throw new Error("Invalid range.");
        index += 3;
        for (let row = Math.min(+first.slice(1), +last.slice(1)); row <= Math.max(+first.slice(1), +last.slice(1)); row++) {
          for (let column = Math.min(first.charCodeAt(0), last.charCodeAt(0)); column <= Math.max(first.charCodeAt(0), last.charCodeAt(0)); column++) {
            const value = valueAt(String.fromCharCode(column) + row);
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

export function toCsv(cells) {
  const addresses = Object.keys(cells);
  if (!addresses.length) return "";
  const rows = Math.max(...addresses.map((address) => +address.slice(1)));
  const columns = Math.max(...addresses.map((address) => address.charCodeAt(0) - 64));
  const valueAt = calculateSheet(cells);
  return Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => {
    const value = valueAt(cellAddress(row, column));
    const text = typeof value === "string" && /^\s*[=+@-]/.test(value) && !/^[+-]?\d+(?:\.\d+)?$/.test(value.trim()) ? "'" + value : String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  }).join(",")).join("\r\n");
}
