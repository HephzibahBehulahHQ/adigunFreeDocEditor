import { calculateWorkbook, cellAddress, conditionalColors, hiddenFilterRows, maxCellLength, maxColumns, maxRows, normalizeCellStyle, normalizeConditionalRule, normalizeNamedRanges, normalizePrintSettings, normalizeSheetProtection, numberFormats, protectionCredentials, parseSheetFilter, validationOptions } from "./sheet-model.js";
import { readWorksheetChart, writeWorksheetChart } from "./sheet-chart-xlsx.js";
import { readWorksheetPivot, writeWorksheetPivot } from "./sheet-pivot-xlsx.js";

const mainNs = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const officeNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageNs = "http://schemas.openxmlformats.org/package/2006/relationships";
const contentNs = "http://schemas.openxmlformats.org/package/2006/content-types";
const xmlHead = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const worksheetType = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
const workbookType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
export const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const styleNames = Object.keys(numberFormats);
const conditionNames = Object.keys(conditionalColors);

function xml(value) {
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
    .replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
}

function createStyleBook() {
  const fonts = [];
  const fills = [];
  const borders = [];
  const cellFormats = [];
  function indexOf(store, value) {
    const index = store.indexOf(value);
    if (index >= 0) return index;
    return store.push(value) - 1;
  }
  function indexFor(formatName, appearance) {
    const style = normalizeCellStyle(appearance);
    const font = indexOf(fonts, `<font>${style.bold ? "<b/>" : ""}${style.italic ? "<i/>" : ""}${style.underline ? "<u/>" : ""}<sz val="${style.size || 11}"/>${style.color ? `<color rgb="FF${style.color}"/>` : ""}<name val="${style.font || "Calibri"}"/></font>`);
    const fill = style.fill ? indexOf(fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${style.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const border = style.border ? indexOf(borders, "<border>" + ["left", "right", "top", "bottom"].map((side) => `<${side} style="thin"><color rgb="FF75839C"/></${side}>`).join("") + "</border>") : 0;
    const number = numberFormats[formatName] || 0;
    if (!font && !fill && !border && !number && !style.align) return 0;
    const flags = [font && 'applyFont="1"', fill && 'applyFill="1"', border && 'applyBorder="1"',
      number && 'applyNumberFormat="1"', style.align && 'applyAlignment="1"'].filter(Boolean).join(" ");
    const start = `<xf numFmtId="${number}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" ${flags}`;
    return indexOf(cellFormats, style.align ? `${start}><alignment horizontal="${style.align}"/></xf>` : `${start}/>`);
  }
  fills.push('<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>');
  borders.push("<border/>");
  cellFormats.push('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>');
  indexFor("general");
  function markup(includeConditions) {
    const collection = (tag, items) => `<${tag} count="${items.length}">${items.join("")}</${tag}>`;
    const differential = includeConditions ? collection("dxfs", conditionNames.map((name) =>
      `<dxf><fill><patternFill patternType="solid"><fgColor rgb="FF${conditionalColors[name]}"/><bgColor rgb="FF${conditionalColors[name]}"/></patternFill></fill></dxf>`)) : "";
    return `<styleSheet xmlns="${mainNs}">${collection("fonts", fonts)}${collection("fills", fills)}${collection("borders", borders)}
      ${collection("cellStyleXfs", ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>'])}
      ${collection("cellXfs", cellFormats)}<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>${differential}</styleSheet>`;
  }
  return { indexFor, markup, hasCellStyles: () => cellFormats.length > 1 };
}

function makeWorksheet({ cells, formats = {}, styles = {}, freezeFirstRow, validation = {}, filter, chart: sheetChart, conditionalRule, print, protection }, valueAt, styleBook) {
  const rows = new Map();
  for (const address of new Set([...Object.keys(cells), ...Object.keys(formats), ...Object.keys(styles)])) {
    const raw = cells[address] ?? "";
    const row = Number(address.slice(1));
    if (!rows.has(row)) rows.set(row, []);
    const value = valueAt(address);
    const missingLookup = value === "#N/A" && valueAt.isError(address);
    let markup;
    if (raw.startsWith("=") && (!valueAt.isError(address) || missingLookup)) {
      const logical = typeof value === "boolean";
      const type = missingLookup ? ' t="e"' : logical ? ' t="b"' : typeof value === "string" ? ' t="str"' : "";
      const cached = logical ? String(Number(value)) : xml(String(value));
      markup = `<c r="${address}"${type}><f>${xml(raw.slice(1))}</f><v>${cached}</v></c>`;
    } else if (raw.trim() && Number.isFinite(Number(raw)) && String(Number(raw)) === raw) {
      markup = `<c r="${address}"><v>${raw}</v></c>`;
    } else {
      const text = raw.startsWith("'") ? raw.slice(1) : raw;
      markup = `<c r="${address}" t="inlineStr"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
    }
    const style = styleBook.indexFor(formats[address], styles[address]);
    if (style > 0) markup = markup.replace("<c ", `<c s="${style}" `);
    rows.get(row).push({ address, markup });
  }
  const hidden = hiddenFilterRows(filter, valueAt);
  for (const row of hidden) if (!rows.has(row)) rows.set(row, []);
  const data = [...rows].sort(([a], [b]) => a - b).map(([row, cellsInRow]) =>
    `<row r="${row}"${hidden.has(row) ? ' hidden="1"' : ""}>${cellsInRow.sort((a, b) => a.address.localeCompare(b.address)).map((cell) => cell.markup).join("")}</row>`).join("");
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
  const filterMarkup = filter
    ? `<autoFilter ref="${filter.range}"><filterColumn colId="${filter.column.charCodeAt(0) - filter.range.charCodeAt(0)}"><filters><filter val="${xml(filter.value)}"/></filters></filterColumn></autoFilter>`
    : "";
  const drawing = sheetChart ? '<drawing r:id="rId1"/>' : "";
  const relationship = sheetChart ? ` xmlns:r="${officeNs}"` : "";
  const condition = normalizeConditionalRule(conditionalRule);
  const conditional = condition
    ? `<conditionalFormatting sqref="${condition.range}"><cfRule type="cellIs" dxfId="${conditionNames.indexOf(condition.color)}" priority="1" operator="${condition.operator}"><formula>${condition.threshold}</formula></cfRule></conditionalFormatting>`
    : "";
  const settings = normalizePrintSettings(print);
  const pageOptions = print
    ? `<printOptions gridLines="${settings.grid ? 1 : 0}"/><pageMargins left="0.472" right="0.472" top="0.472" bottom="0.472" header="0.25" footer="0.25"/><pageSetup paperSize="${settings.paper === "letter" ? 1 : 9}" orientation="${settings.orientation}" fitToWidth="1" fitToHeight="0"/>`
    : "";
  const pageProperties = print ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : "";
  const protectedSheet = normalizeSheetProtection(protection);
  const protectionMarkup = protectedSheet
    ? '<sheetProtection sheet="1"' + Object.entries(protectedSheet)
      .map(([name, value]) => ` ${name}="${typeof value === "boolean" ? Number(value) : xml(value)}"`).join("") + "/>"
    : "";
  return `<worksheet xmlns="${mainNs}"${relationship}>${pageProperties}${views}<sheetData>${data}</sheetData>${protectionMarkup}${filterMarkup}${conditional}${validations}${pageOptions}${drawing}</worksheet>`;
}

function readFilter(worksheet) {
  const autoFilter = worksheet.getElementsByTagNameNS(mainNs, "autoFilter")[0];
  if (!autoFilter || autoFilter.children.length !== 1) return null;
  const range = autoFilter.getAttribute("ref") ?? "";
  const filterColumn = autoFilter.firstElementChild;
  const offset = filterColumn.getAttribute("colId") ?? "";
  const filters = filterColumn.firstElementChild;
  if (!/^\d{1,2}$/.test(offset) || filters?.localName !== "filters" || filters.children.length !== 1 ||
    filters.firstElementChild.localName !== "filter" || ["1", "true"].includes(filters.getAttribute("blank"))) return null;
  const column = String.fromCharCode(range.charCodeAt(0) + Number(offset));
  return parseSheetFilter({ range, column, value: filters.firstElementChild.getAttribute("val") });
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

export function exportWorkbook(sheets, zip, date1904 = false, namesInput, onPivotFallback) {
  const files = {};
  const workbookSheets = [];
  const sheetNames = [];
  const rels = [];
  const overrides = [];
  const names = new Set();
  const printNames = [];
  const styleBook = createStyleBook();
  for (const [index, sheet] of sheets.entries()) {
    const id = index + 1;
    const target = `worksheets/sheet${id}.xml`;
    const base = (sheet.name || `Sheet ${id}`).replace(/[\\/:?*\[\]]/g, " ").replace(/^'+|'+$/g, "").trim() || `Sheet ${id}`;
    let name = base.slice(0, 31);
    for (let suffix = 2; names.has(name.toLowerCase()); suffix++) {
      name = base.slice(0, 30 - String(suffix).length) + " " + suffix;
    }
    names.add(name.toLowerCase());
    sheetNames.push(name);
    workbookSheets.push(`<sheet name="${xml(name)}" sheetId="${id}"${sheet.hidden ? ' state="hidden"' : ""} r:id="rId${id}"/>`);
    if (sheet.print) {
      const settings = normalizePrintSettings(sheet.print);
      const prefix = "'" + name.replaceAll("'", "''") + "'!";
      const addName = (key, reference) => printNames.push(`<definedName name="_xlnm.${key}" localSheetId="${index}">${xml(prefix + reference)}</definedName>`);
      if (settings.range) {
        const [start, end = start] = settings.range.split(":");
        const absolute = (address) => "$" + address[0] + "$" + address.slice(1);
        addName("Print_Area", absolute(start) + ":" + absolute(end));
      }
      if (settings.repeat) {
        const row = settings.range.split(":")[0].slice(1) || "1";
        addName("Print_Titles", `$${row}:$${row}`);
      }
    }
    rels.push(`<Relationship Id="rId${id}" Type="${officeNs}/worksheet" Target="${target}"/>`);
    overrides.push(`<Override PartName="/xl/${target}" ContentType="${worksheetType}"/>`);
    const valueAt = calculateWorkbook(sheets, index, date1904, namesInput);
    files["xl/" + target] = makeWorksheet(sheet, valueAt, styleBook);
    if (sheet.chart) writeWorksheetChart(files, overrides, id, name, sheet.chart, valueAt, xml);
  }
  const pivotCaches = [];
  for (const [index, sheet] of sheets.entries()) {
    if (!sheet.pivot) continue;
    const source = sheet.pivot.source;
    const record = writeWorksheetPivot({
      files, overrides, rels, id: index + 1, sourceName: sheetNames[source], source: sheets[source], sheet, xml,
      valueAt: calculateWorkbook(sheets, source, date1904, namesInput),
    });
    if (record) pivotCaches.push(record);
    else onPivotFallback?.(sheetNames[index]);
  }
  const hasConditions = sheets.some((sheet) => normalizeConditionalRule(sheet.conditionalRule));
  if (hasConditions || styleBook.hasCellStyles()) {
    rels.push(`<Relationship Id="rIdStyles" Type="${officeNs}/styles" Target="styles.xml"/>`);
    overrides.push('<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>');
    files["xl/styles.xml"] = styleBook.markup(hasConditions);
  }
  const workbookViews = sheets.some((sheet) => sheet.freezeFirstRow || sheet.hidden)
    ? `<bookViews><workbookView activeTab="${Math.max(0, sheets.findIndex((sheet) => !sheet.hidden))}"/></bookViews>`
    : "";
  const namedRanges = normalizeNamedRanges(namesInput).map(({ name, sheet, range }) => {
    const absolute = range.replace(/([A-Z])(\d+)/g, (_, column, row) => "$" + column + "$" + row);
    const reference = "'" + sheet.replaceAll("'", "''") + "'!" + absolute;
    return `<definedName name="${xml(name)}">${xml(reference)}</definedName>`;
  });
  const definitions = [...printNames, ...namedRanges];
  const definedNames = definitions.length ? `<definedNames>${definitions.join("")}</definedNames>` : "";
  const workbookProperties = date1904 ? '<workbookPr date1904="1"/>' : "";
  const pivotCacheList = pivotCaches.length ? `<pivotCaches>${pivotCaches.join("")}</pivotCaches>` : "";
  files["xl/workbook.xml"] = `<workbook xmlns="${mainNs}" xmlns:r="${officeNs}">${workbookProperties}${workbookViews}<sheets>${workbookSheets.join("")}</sheets>${definedNames}${pivotCacheList}</workbook>`;
  files["xl/_rels/workbook.xml.rels"] = `<Relationships xmlns="${packageNs}">${rels.join("")}</Relationships>`;
  files["_rels/.rels"] = `<Relationships xmlns="${packageNs}"><Relationship Id="rId1" Type="${officeNs}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  files["[Content_Types].xml"] = `<Types xmlns="${contentNs}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${workbookType}"/>${overrides.join("")}</Types>`;
  return zip.zipSync(Object.fromEntries(Object.entries(files).map(([name, value]) => [name, zip.strToU8(xmlHead + value)])));
}

export function importWorkbook(bytes, zip, Parser = DOMParser) {
  let total = 0;
  const files = zip.unzipSync(bytes, {
    filter({ name, originalSize }) {
      if (!/^xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|(?:worksheets|drawings|charts|pivotTables|pivotCache)\/[\w.-]+\.xml|(?:worksheets|drawings)\/_rels\/[\w.-]+\.xml\.rels)$/.test(name)) return false;
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
  const styles = Object.hasOwn(files, "xl/styles.xml") ? parse("xl/styles.xml") : null;
  const cellXfs = styles?.getElementsByTagNameNS("*", "cellXfs")[0];
  const savedFormats = Array.from(cellXfs?.children ?? [], (xf) =>
    styleNames.find((format) => String(numberFormats[format]) === xf.getAttribute("numFmtId")));
  const parts = (tag) => styles?.getElementsByTagNameNS(mainNs, tag)[0]?.children ?? [];
  const child = (element, tag) => element?.getElementsByTagNameNS(mainNs, tag)[0];
  const readColor = (element) => /^(?:[\da-f]{2})?([\da-f]{6})$/i.exec(element?.getAttribute("rgb") ?? "")?.[1];
  const activeStyle = (element) => element && !["0", "false", "none"].includes(element.getAttribute("val"));
  const savedStyles = Array.from(cellXfs?.children ?? [], (format) => {
    const font = parts("fonts")[Number(format.getAttribute("fontId"))];
    const border = parts("borders")[Number(format.getAttribute("borderId"))];
    const fill = child(parts("fills")[Number(format.getAttribute("fillId"))], "patternFill");
    const fontName = child(font, "name")?.getAttribute("val");
    const size = Number(child(font, "sz")?.getAttribute("val"));
    return normalizeCellStyle({
      font: fontName === "Calibri" ? undefined : fontName,
      size: size === 11 ? undefined : size,
      bold: Boolean(activeStyle(child(font, "b"))),
      italic: Boolean(activeStyle(child(font, "i"))),
      underline: Boolean(activeStyle(child(font, "u"))),
      color: readColor(child(font, "color")),
      fill: fill?.getAttribute("patternType") === "solid" ? readColor(child(fill, "fgColor")) : undefined,
      border: ["left", "right", "top", "bottom"].every((side) => child(border, side)?.getAttribute("style") === "thin"),
      align: child(format, "alignment")?.getAttribute("horizontal"),
    });
  });
  const fills = Array.from(styles?.getElementsByTagNameNS(mainNs, "dxfs")[0]?.children ?? [], (dxf) => {
    const color = dxf.getElementsByTagNameNS(mainNs, "fgColor")[0]?.getAttribute("rgb")?.toUpperCase();
    return conditionNames.find((name) => "FF" + conditionalColors[name] === color);
  });
  const workbook = parse("xl/workbook.xml");
  const date1904 = ["1", "true"].includes(workbook.getElementsByTagNameNS(mainNs, "workbookPr")[0]?.getAttribute("date1904"));
  const definitions = [...workbook.getElementsByTagNameNS("*", "sheet")];
  const printNames = [...workbook.getElementsByTagNameNS(mainNs, "definedName")].filter((item) =>
    ["_xlnm.Print_Area", "_xlnm.Print_Titles"].includes(item.getAttribute("name")) && /^\d+$/.test(item.getAttribute("localSheetId") ?? ""));
  if (!definitions.length || definitions.length > 12) throw new Error("A workbook must contain between 1 and 12 sheets.");
  const worksheetPaths = [];
  const sheets = definitions.map((definition, index) => {
    const relationship = [...definition.attributes].find((attribute) => attribute.localName === "id" && attribute.namespaceURI);
    const target = relationships.get(relationship?.value) || "";
    const path = target.startsWith("/") ? target.slice(1) : "xl/" + target;
    if (!/^xl\/worksheets\/[\w.-]+\.xml$/.test(path)) throw new Error("The workbook uses an unsupported worksheet location.");
    worksheetPaths.push(path);
    const cells = {};
    const formats = {};
    const cellStyles = {};
    let rows = 20;
    let columns = 8;
    const worksheet = parse(path);
    const namedPrint = (key) => printNames.find((item) =>
      item.getAttribute("name") === "_xlnm." + key && Number(item.getAttribute("localSheetId")) === index)?.textContent.split("!").at(-1).replaceAll("$", "");
    const setup = worksheet.getElementsByTagNameNS(mainNs, "pageSetup")[0];
    const options = worksheet.getElementsByTagNameNS(mainNs, "printOptions")[0];
    const printedRange = namedPrint("Print_Area");
    const titles = namedPrint("Print_Titles");
    const printedFirstRow = printedRange?.match(/^[A-Z]([1-9]\d*)/)?.[1] ?? "1";
    const print = setup || options || printedRange || titles ? normalizePrintSettings({
      range: printedRange, paper: setup?.getAttribute("paperSize") === "1" ? "letter" : "a4",
      orientation: setup?.getAttribute("orientation"), grid: ["1", "true"].includes(options?.getAttribute("gridLines")),
      repeat: titles === printedFirstRow + ":" + printedFirstRow,
    }) : undefined;
    const name = definition.getAttribute("name") || "";
    const chart = readWorksheetChart(files, parse, worksheet, path, name);
    const validation = readValidation(worksheet);
    const filter = readFilter(worksheet);
    const conditionalRange = worksheet.getElementsByTagNameNS(mainNs, "conditionalFormatting")[0];
    const condition = conditionalRange?.getElementsByTagNameNS(mainNs, "cfRule")[0];
    const threshold = condition?.getElementsByTagNameNS(mainNs, "formula")[0]?.textContent?.trim();
    const conditionalRule = condition?.getAttribute("type") === "cellIs" && threshold
      ? normalizeConditionalRule({
        range: conditionalRange.getAttribute("sqref"),
        operator: condition.getAttribute("operator"),
        threshold: Number(threshold),
        color: fills[condition.getAttribute("dxfId")],
      }) : null;
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
      const style = savedStyles[Number(node.getAttribute("s"))];
      const hasStyle = style && Object.keys(style).length;
      if (!raw && (!format || format === "general") && !hasStyle) continue;
      if (!formula && /^[=']/.test(raw)) raw = "'" + raw;
      if (!/^[A-Z](?:[1-9]\d?|100)$/.test(address) || raw.length > maxCellLength) {
        throw new Error("Workbook cells exceed the 100-row, 26-column, or cell-length limit.");
      }
      if (raw) cells[address] = raw;
      if (format && format !== "general") formats[address] = format;
      if (hasStyle) cellStyles[address] = style;
      rows = Math.max(rows, Number(address.slice(1)));
      columns = Math.max(columns, address.charCodeAt(0) - 64);
    }
    for (const address of Object.keys(validation)) {
      rows = Math.max(rows, Number(address.slice(1)));
      columns = Math.max(columns, address.charCodeAt(0) - 64);
    }
    for (const rule of [filter, conditionalRule, print?.range && print].filter(Boolean)) {
      const end = rule.range.split(":").at(-1);
      rows = Math.max(rows, Number(end.slice(1)));
      columns = Math.max(columns, end.charCodeAt(0) - 64);
    }
    if (chart) {
      rows = Math.max(rows, chart.last);
      columns = Math.max(columns, chart.values.charCodeAt(0) - 64);
    }
    const hidden = ["hidden", "veryHidden"].includes(definition.getAttribute("state"));
    const protectionNode = worksheet.getElementsByTagNameNS(mainNs, "sheetProtection")[0];
    const protection = ["1", "true"].includes(protectionNode?.getAttribute("sheet"))
      ? normalizeSheetProtection(Object.fromEntries(Array.from(protectionNode.attributes, ({ name, value }) =>
        [name, protectionCredentials.includes(name) ? value : { "1": true, true: true, "0": false, false: false }[value]])))
      : null;
    return { name, rows: Math.min(rows, maxRows), columns: Math.min(columns, maxColumns), cells, formats, styles: cellStyles, freezeFirstRow, validation, filter, chart, hidden, conditionalRule, print, protection };
  });
  for (const [index, sheet] of sheets.entries()) {
    try {
      const pivot = readWorksheetPivot(files, parse, worksheetPaths[index], sheets, index, workbook);
      if (pivot) sheet.pivot = pivot;
    } catch { /* Keep the worksheet cells when the optional PivotTable cannot be read. */ }
  }
  const sheetNames = new Map(sheets.map(({ name }, index) => [(name || `Sheet ${index + 1}`).toUpperCase(), name || `Sheet ${index + 1}`]));
  const namedRanges = normalizeNamedRanges([...workbook.getElementsByTagNameNS(mainNs, "definedName")].flatMap((item) => {
    if (item.hasAttribute("localSheetId") || ["1", "true"].includes(item.getAttribute("hidden"))) return [];
    const match = /^(?:'((?:[^']|'')+)'|([\w.]+))!(\$[A-Z]\$(?:[1-9]\d?|100)(?::\$[A-Z]\$(?:[1-9]\d?|100))?)$/i.exec(item.textContent.trim());
    if (!match) return [];
    const sheet = sheetNames.get((match[1]?.replaceAll("''", "'") ?? match[2]).toUpperCase());
    return [{ name: item.getAttribute("name"), sheet, range: match[3] }];
  }));
  return { sheets, date1904, namedRanges };
}
