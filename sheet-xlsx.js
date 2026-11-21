import { calculateWorkbook, cellAddress, maxCellLength, maxColumns, maxRows, numberFormats, validationOptions } from "./sheet-model.js";

const mainNs = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const officeNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageNs = "http://schemas.openxmlformats.org/package/2006/relationships";
const contentNs = "http://schemas.openxmlformats.org/package/2006/content-types";
const xmlHead = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const worksheetType = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
const workbookType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
export const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const styleNames = Object.keys(numberFormats);

function xml(value) {
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
    .replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
}

function makeWorksheet({ cells, formats = {}, freezeFirstRow, validation = {} }, valueAt) {
  const rows = new Map();
  for (const address of new Set([...Object.keys(cells), ...Object.keys(formats)])) {
    const raw = cells[address] ?? "";
    const row = Number(address.slice(1));
    if (!rows.has(row)) rows.set(row, []);
    const value = valueAt(address);
    let markup;
    if (raw.startsWith("=") && typeof value === "number") {
      markup = `<c r="${address}"><f>${xml(raw.slice(1))}</f><v>${value}</v></c>`;
    } else if (raw.trim() && Number.isFinite(Number(raw)) && String(Number(raw)) === raw) {
      markup = `<c r="${address}"><v>${raw}</v></c>`;
    } else {
      const text = raw.startsWith("'") ? raw.slice(1) : raw;
      markup = `<c r="${address}" t="inlineStr"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
    }
    const style = styleNames.indexOf(formats[address]);
    if (style > 0) markup = markup.replace("<c ", `<c s="${style}" `);
    rows.get(row).push({ address, markup });
  }
  const data = [...rows].sort(([a], [b]) => a - b).map(([row, cellsInRow]) =>
    `<row r="${row}">${cellsInRow.sort((a, b) => a.address.localeCompare(b.address)).map((cell) => cell.markup).join("")}</row>`).join("");
  const views = freezeFirstRow
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>'
    : "";
  const lists = new Map();
  for (const [address, options] of Object.entries(validation)) {
    const list = options.join(",");
    if (!lists.has(list)) lists.set(list, []);
    lists.get(list).push(address);
  }
  const rules = [...lists].map(([list, addresses]) =>
    `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${addresses.join(" ")}"><formula1>"${xml(list)}"</formula1></dataValidation>`).join("");
  const validations = rules ? `<dataValidations count="${lists.size}">${rules}</dataValidations>` : "";
  return `<worksheet xmlns="${mainNs}">${views}<sheetData>${data}</sheetData>${validations}</worksheet>`;
}

function readValidation(worksheet) {
  const validation = {};
  let visited = 0;
  for (const rule of worksheet.getElementsByTagNameNS(mainNs, "dataValidation")) {
    if (rule.getAttribute("type") !== "list") continue;
    const formula = rule.getElementsByTagNameNS(mainNs, "formula1")[0]?.textContent ?? "";
    if (!/^"[^"]+"$/.test(formula)) continue;
    const options = validationOptions(formula.slice(1, -1).split(","));
    if (!options.length) continue;
    for (const address of (rule.getAttribute("sqref") ?? "").split(/\s+/)) {
      const match = /^([A-Z])([1-9]\d?|100)(?::([A-Z])([1-9]\d?|100))?$/.exec(address);
      if (!match) continue;
      const [, firstColumn, firstRow, lastColumn = firstColumn, lastRow = firstRow] = match;
      for (let row = Number(firstRow) - 1; row < Number(lastRow); row++) {
        for (let column = firstColumn.charCodeAt(0) - 65; column <= lastColumn.charCodeAt(0) - 65; column++) {
          if (++visited > maxRows * maxColumns) return validation;
          validation[cellAddress(row, column)] = options;
        }
      }
    }
  }
  return validation;
}

export function exportWorkbook(sheets, zip) {
  const files = {};
  const workbookSheets = [];
  const rels = [];
  const overrides = [];
  const names = new Set();
  for (const [index, sheet] of sheets.entries()) {
    const id = index + 1;
    const target = `worksheets/sheet${id}.xml`;
    const base = (sheet.name || `Sheet ${id}`).replace(/[\\/:?*\[\]]/g, " ").replace(/^'+|'+$/g, "").trim() || `Sheet ${id}`;
    let name = base.slice(0, 31);
    for (let suffix = 2; names.has(name.toLowerCase()); suffix++) {
      name = base.slice(0, 30 - String(suffix).length) + " " + suffix;
    }
    names.add(name.toLowerCase());
    workbookSheets.push(`<sheet name="${xml(name)}" sheetId="${id}" r:id="rId${id}"/>`);
    rels.push(`<Relationship Id="rId${id}" Type="${officeNs}/worksheet" Target="${target}"/>`);
    overrides.push(`<Override PartName="/xl/${target}" ContentType="${worksheetType}"/>`);
    files["xl/" + target] = makeWorksheet(sheet, calculateWorkbook(sheets, index));
  }
  if (sheets.some((sheet) => Object.keys(sheet.formats ?? {}).length)) {
    rels.push(`<Relationship Id="rIdStyles" Type="${officeNs}/styles" Target="styles.xml"/>`);
    overrides.push('<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>');
    const formats = styleNames.map((name) => `<xf numFmtId="${numberFormats[name]}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join("");
    files["xl/styles.xml"] = `<styleSheet xmlns="${mainNs}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${styleNames.length}">${formats}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }
  const workbookViews = sheets.some((sheet) => sheet.freezeFirstRow) ? "<bookViews><workbookView/></bookViews>" : "";
  files["xl/workbook.xml"] = `<workbook xmlns="${mainNs}" xmlns:r="${officeNs}">${workbookViews}<sheets>${workbookSheets.join("")}</sheets></workbook>`;
  files["xl/_rels/workbook.xml.rels"] = `<Relationships xmlns="${packageNs}">${rels.join("")}</Relationships>`;
  files["_rels/.rels"] = `<Relationships xmlns="${packageNs}"><Relationship Id="rId1" Type="${officeNs}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  files["[Content_Types].xml"] = `<Types xmlns="${contentNs}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${workbookType}"/>${overrides.join("")}</Types>`;
  return zip.zipSync(Object.fromEntries(Object.entries(files).map(([name, value]) => [name, zip.strToU8(xmlHead + value)])));
}

export function importWorkbook(bytes, zip, Parser = DOMParser) {
  let total = 0;
  const files = zip.unzipSync(bytes, {
    filter({ name, originalSize }) {
      if (!/^xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[\w.-]+\.xml)$/.test(name)) return false;
      total += originalSize;
      if (total > 12 * 1024 * 1024) throw new Error("Workbook content is too large.");
      return true;
    },
  });
  const parse = (name) => {
    if (!Object.hasOwn(files, name)) throw new Error("A workbook part is missing.");
    const source = zip.strFromU8(files[name]);
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("The workbook contains unsupported XML.");
    const parsed = new Parser().parseFromString(source, "application/xml");
    if (parsed.getElementsByTagName("parsererror").length) throw new Error("A workbook part is invalid.");
    return parsed;
  };
  const relationships = new Map([...parse("xl/_rels/workbook.xml.rels").getElementsByTagNameNS("*", "Relationship")]
    .filter((part) => part.getAttribute("Type")?.endsWith("/worksheet") && part.getAttribute("TargetMode") !== "External")
    .map((part) => [part.getAttribute("Id"), part.getAttribute("Target")]));
  const textRuns = (node) => [...node.getElementsByTagNameNS("*", "t")].map((run) => run.textContent).join("");
  const shared = Object.hasOwn(files, "xl/sharedStrings.xml")
    ? [...parse("xl/sharedStrings.xml").getElementsByTagNameNS("*", "si")].map(textRuns) : [];
  const cellXfs = Object.hasOwn(files, "xl/styles.xml") ? parse("xl/styles.xml").getElementsByTagNameNS("*", "cellXfs")[0] : null;
  const savedFormats = Array.from(cellXfs?.children ?? [], (xf) =>
    styleNames.find((format) => String(numberFormats[format]) === xf.getAttribute("numFmtId")));
  const definitions = [...parse("xl/workbook.xml").getElementsByTagNameNS("*", "sheet")];
  if (!definitions.length || definitions.length > 12) throw new Error("A workbook must contain between 1 and 12 sheets.");
  return definitions.map((definition) => {
    const relationship = [...definition.attributes].find((attribute) => attribute.localName === "id" && attribute.namespaceURI);
    const target = relationships.get(relationship?.value) || "";
    const path = target.startsWith("/") ? target.slice(1) : "xl/" + target;
    if (!/^xl\/worksheets\/[\w.-]+\.xml$/.test(path)) throw new Error("The workbook uses an unsupported worksheet location.");
    const cells = {};
    const formats = {};
    let rows = 20;
    let columns = 8;
    const worksheet = parse(path);
    const validation = readValidation(worksheet);
    const pane = worksheet.getElementsByTagNameNS(mainNs, "pane")[0];
    const freezeFirstRow = pane?.getAttribute("state") === "frozen" && pane.getAttribute("ySplit") === "1" &&
      !Number(pane.getAttribute("xSplit"));
    for (const node of worksheet.getElementsByTagNameNS("*", "c")) {
      const address = node.getAttribute("r");
      const formula = node.getElementsByTagNameNS("*", "f")[0]?.textContent;
      const value = node.getElementsByTagNameNS("*", "v")[0]?.textContent;
      let raw = value ?? "";
      const type = node.getAttribute("t");
      if (formula) raw = "=" + formula;
      else if (type === "s") {
        if (!/^\d+$/.test(raw) || shared[Number(raw)] === undefined) throw new Error("A shared text value is missing.");
        raw = shared[Number(raw)];
      } else if (type === "inlineStr") raw = textRuns(node);
      else if (type === "b") raw = value === "1" ? "TRUE" : "FALSE";
      const format = savedFormats[Number(node.getAttribute("s"))];
      if (!raw && (!format || format === "general")) continue;
      if (!formula && /^[=']/.test(raw)) raw = "'" + raw;
      if (!/^[A-Z](?:[1-9]\d?|100)$/.test(address) || raw.length > maxCellLength) {
        throw new Error("Workbook cells exceed the 100-row, 26-column, or cell-length limit.");
      }
      if (raw) cells[address] = raw;
      if (format && format !== "general") formats[address] = format;
      rows = Math.max(rows, Number(address.slice(1)));
      columns = Math.max(columns, address.charCodeAt(0) - 64);
    }
    for (const address of Object.keys(validation)) {
      rows = Math.max(rows, Number(address.slice(1)));
      columns = Math.max(columns, address.charCodeAt(0) - 64);
    }
    return { name: definition.getAttribute("name") || "", rows: Math.min(rows, maxRows), columns: Math.min(columns, maxColumns), cells, formats, freezeFirstRow, validation };
  });
}
