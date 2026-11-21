import { calculateSheet, maxCellLength, maxColumns, maxRows } from "./sheet-model.js";

const mainNs = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const officeNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageNs = "http://schemas.openxmlformats.org/package/2006/relationships";
const contentNs = "http://schemas.openxmlformats.org/package/2006/content-types";
const xmlHead = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const worksheetType = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
const workbookType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
export const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function xml(value) {
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
    .replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
}

function makeWorksheet(cells) {
  const rows = new Map();
  const valueAt = calculateSheet(cells);
  for (const [address, raw] of Object.entries(cells)) {
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
    rows.get(row).push({ address, markup });
  }
  const data = [...rows].sort(([a], [b]) => a - b).map(([row, cellsInRow]) =>
    `<row r="${row}">${cellsInRow.sort((a, b) => a.address.localeCompare(b.address)).map((cell) => cell.markup).join("")}</row>`).join("");
  return `<worksheet xmlns="${mainNs}"><sheetData>${data}</sheetData></worksheet>`;
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
    files["xl/" + target] = makeWorksheet(sheet.cells);
  }
  files["xl/workbook.xml"] = `<workbook xmlns="${mainNs}" xmlns:r="${officeNs}"><sheets>${workbookSheets.join("")}</sheets></workbook>`;
  files["xl/_rels/workbook.xml.rels"] = `<Relationships xmlns="${packageNs}">${rels.join("")}</Relationships>`;
  files["_rels/.rels"] = `<Relationships xmlns="${packageNs}"><Relationship Id="rId1" Type="${officeNs}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  files["[Content_Types].xml"] = `<Types xmlns="${contentNs}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${workbookType}"/>${overrides.join("")}</Types>`;
  return zip.zipSync(Object.fromEntries(Object.entries(files).map(([name, value]) => [name, zip.strToU8(xmlHead + value)])));
}

export function importWorkbook(bytes, zip, Parser = DOMParser) {
  let total = 0;
  const files = zip.unzipSync(bytes, {
    filter({ name, originalSize }) {
      if (!/^xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[\w.-]+\.xml)$/.test(name)) return false;
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
  const definitions = [...parse("xl/workbook.xml").getElementsByTagNameNS("*", "sheet")];
  if (!definitions.length || definitions.length > 12) throw new Error("A workbook must contain between 1 and 12 sheets.");
  return definitions.map((definition) => {
    const relationship = [...definition.attributes].find((attribute) => attribute.localName === "id" && attribute.namespaceURI);
    const target = relationships.get(relationship?.value) || "";
    const path = target.startsWith("/") ? target.slice(1) : "xl/" + target;
    if (!/^xl\/worksheets\/[\w.-]+\.xml$/.test(path)) throw new Error("The workbook uses an unsupported worksheet location.");
    const cells = {};
    let rows = 20;
    let columns = 8;
    for (const node of parse(path).getElementsByTagNameNS("*", "c")) {
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
      if (!raw) continue;
      if (!formula && /^[=']/.test(raw)) raw = "'" + raw;
      if (!/^[A-Z](?:[1-9]\d?|100)$/.test(address) || raw.length > maxCellLength) {
        throw new Error("Workbook cells exceed the 100-row, 26-column, or cell-length limit.");
      }
      cells[address] = raw;
      rows = Math.max(rows, Number(address.slice(1)));
      columns = Math.max(columns, address.charCodeAt(0) - 64);
    }
    return { name: definition.getAttribute("name") || "", rows: Math.min(rows, maxRows), columns: Math.min(columns, maxColumns), cells };
  });
}
