import { buildPivot } from "./sheet-model.js";

const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const office = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageNs = "http://schemas.openxmlformats.org/package/2006/relationships";
const relation = (id, kind, target) => `<Relationship Id="${id}" Type="${office}/${kind}" Target="${target}"/>`;
const relationships = (links) => `<Relationships xmlns="${packageNs}">${links}</Relationships>`;
const partType = (path, kind) =>
  `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.${kind}+xml"/>`;
const rangePattern = /^([A-Z])([1-9]\d?|100):([A-Z])([1-9]\d?|100)$/;

function cacheValue(value, xml) {
  if (value === "") return "<m/>";
  if (typeof value === "boolean") return `<b v="${Number(value)}"/>`;
  if (typeof value === "number" || String(Number(value)) === value && Number.isFinite(Number(value))) return `<n v="${value}"/>`;
  return `<s v="${xml(value)}"/>`;
}

export function writeWorksheetPivot({ files, overrides, rels, id, sourceName, source, sheet, valueAt, xml }) {
  const pivot = sheet.pivot;
  const range = pivot?.range?.trim().toUpperCase();
  const bounds = rangePattern.exec(range);
  if (!bounds || !source || source === sheet || !sourceName) return "";
  const [, left, first, right, last] = bounds;
  const fields = Array.from({ length: right.charCodeAt(0) - left.charCodeAt(0) + 1 },
    (_, offset) => String.fromCharCode(left.charCodeAt(0) + offset));
  const group = fields.indexOf(pivot.group?.trim().toUpperCase());
  const measure = fields.indexOf(pivot.measure?.trim().toUpperCase());
  if (group < 0 || measure < 0 || group === measure) return "";
  const headers = fields.map((column) => String(valueAt(column + first)));
  if (headers.some((name) => !name.trim() || name.length > 255) ||
      new Set(headers.map((name) => name.toUpperCase())).size !== headers.length) return "";
  let summary;
  try { summary = buildPivot(source.cells, pivot, valueAt).cells; }
  catch { return ""; }
  const dataRows = +last - +first;
  const grouped = new Map();
  const numericGroups = new Set();
  const rows = [];
  for (let row = +first + 1; row <= +last; row++) {
    const values = fields.map((column) => valueAt(column + row));
    const measured = values[measure];
    if (pivot.aggregate !== "count" && typeof measured === "string" && measured.trim() &&
        /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(measured.trim()) && String(Number(measured)) !== measured) return "";
    const key = values[group];
    if (cacheValue(measured, xml).startsWith("<n ")) numericGroups.add(key);
    const cell = cacheValue(key, xml);
    if (!grouped.has(key)) grouped.set(key, { cell, index: grouped.size });
    rows.push(values.map((value, index) =>
      index === group ? `<x v="${grouped.get(key).index}"/>` : cacheValue(value, xml)));
  }
  const activeItems = [...grouped].filter(([value]) => value !== "").map(([, item]) => item);
  if (!activeItems.length || new Set([...grouped.values()].map((item) => item.cell.toUpperCase())).size !== grouped.size) return "";
  if (pivot.aggregate === "average" && [...grouped.keys()].some((key) => key !== "" && !numericGroups.has(key))) return "";
  const sameOutput = Object.entries(summary).every(([address, expected]) => sheet.cells[address] === expected);
  const endRow = activeItems.length + 1;
  if (!sameOutput || Object.keys(sheet.cells).some((cell) => /^[AB]\d+$/.test(cell) && +cell.slice(1) > endRow)) return "";

  const table = `xl/pivotTables/pivotTable${id}.xml`;
  const definition = `xl/pivotCache/pivotCacheDefinition${id}.xml`;
  const records = `xl/pivotCache/pivotCacheRecords${id}.xml`;
  const items = [...grouped].map(([value, item]) => `<item x="${item.index}"${value === "" ? ' h="1"' : ""}/>`).join("");
  const pivotFields = fields.map((_, index) => index === group
    ? `<pivotField axis="axisRow" showAll="0" defaultSubtotal="0"><items count="${grouped.size}">${items}</items></pivotField>`
    : `<pivotField showAll="0"${index === measure ? ' dataField="1"' : ""}/>`).join("");
  const rowItems = activeItems.map(({ index }) => `<i><x v="${index}"/></i>`).join("");
  const caption = pivot.aggregate.toUpperCase() + " of " + headers[measure];
  files[table] = `<pivotTableDefinition xmlns="${main}" name="AdigunPivot${id}" cacheId="${id}" dataCaption="Values" createdVersion="6" updatedVersion="6" minRefreshableVersion="3" compact="0" compactData="0" rowGrandTotals="0" colGrandTotals="0"><location ref="A1:B${endRow}" firstHeaderRow="1" firstDataRow="1" firstDataCol="1"/><pivotFields count="${fields.length}">${pivotFields}</pivotFields><rowFields count="1"><field x="${group}"/></rowFields><rowItems count="${activeItems.length}">${rowItems}</rowItems><colItems count="1"><i><x v="0"/></i></colItems><dataFields count="1"><dataField name="${xml(caption)}" fld="${measure}" subtotal="${pivot.aggregate}" baseField="0" baseItem="0"/></dataFields><pivotTableStyleInfo name="PivotStyleLight16" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="0"/></pivotTableDefinition>`;
  const cacheFields = headers.map((name, index) => {
    const items = index === group ? [...grouped.values()].map(({ cell }) => cell) : [];
    const types = new Set((index === group ? items : rows.map((row) => row[index])).map((value) => value[1]));
    const mixed = [...types].filter((type) => type !== "m").length > 1;
    const shared = `<sharedItems containsBlank="${Number(types.has("m"))}" containsString="${Number(types.has("s"))}" containsNumber="${Number(types.has("n"))}" containsMixedTypes="${Number(mixed)}" containsSemiMixedTypes="${Number(types.has("m") || types.has("s"))}" count="${items.length}">${items.join("")}</sharedItems>`;
    return `<cacheField name="${xml(name)}" numFmtId="0">${shared}</cacheField>`;
  }).join("");
  files[definition] = `<pivotCacheDefinition xmlns="${main}" xmlns:r="${office}" r:id="rId1" createdVersion="6" refreshedVersion="6" minRefreshableVersion="3" recordCount="${dataRows}"><cacheSource type="worksheet"><worksheetSource ref="${range}" sheet="${xml(sourceName)}"/></cacheSource><cacheFields count="${fields.length}">${cacheFields}</cacheFields></pivotCacheDefinition>`;
  files[records] = `<pivotCacheRecords xmlns="${main}" count="${dataRows}">${rows.map((row) => "<r>" + row.join("") + "</r>").join("")}</pivotCacheRecords>`;
  const worksheetRels = `xl/worksheets/_rels/sheet${id}.xml.rels`;
  const sheetLink = relation("rIdPivot", "pivotTable", `../pivotTables/pivotTable${id}.xml`);
  files[worksheetRels] = files[worksheetRels] ? files[worksheetRels].replace("</Relationships>", sheetLink + "</Relationships>") : relationships(sheetLink);
  files[`xl/pivotTables/_rels/pivotTable${id}.xml.rels`] = relationships(relation("rId1", "pivotCacheDefinition", `../pivotCache/pivotCacheDefinition${id}.xml`));
  files[`xl/pivotCache/_rels/pivotCacheDefinition${id}.xml.rels`] = relationships(relation("rId1", "pivotCacheRecords", `pivotCacheRecords${id}.xml`));
  rels.push(relation(`rIdPivotCache${id}`, "pivotCacheDefinition", `pivotCache/pivotCacheDefinition${id}.xml`));
  overrides.push(partType(table, "pivotTable"), partType(definition, "pivotCacheDefinition"), partType(records, "pivotCacheRecords"));
  return `<pivotCache cacheId="${id}" r:id="rIdPivotCache${id}"/>`;
}

export function readWorksheetPivot(files, parse, worksheetPath, sheets, worksheetIndex, workbook) {
  const related = (path, kind, folder, id) => {
    const relPath = path.replace(/\/([^/]+)$/, "/_rels/$1.rels");
    if (!Object.hasOwn(files, relPath)) return null;
    const matches = [...parse(relPath).getElementsByTagNameNS(packageNs, "Relationship")].filter((entry) =>
      entry.getAttribute("Type") === office + "/" + kind && entry.getAttribute("TargetMode") !== "External" &&
      (!id || id === entry.getAttribute("Id")));
    if (matches.length !== 1) return null;
    const match = /^(?:\.\.\/|\/xl\/|)(pivotTables|pivotCache)\/([\w.-]+\.xml)$/.exec(matches[0].getAttribute("Target") ?? "");
    if (!match || match[1] !== folder) return null;
    const destination = "xl/" + folder + "/" + match[2];
    return Object.hasOwn(files, destination) ? destination : null;
  };
  const tablePath = related(worksheetPath, "pivotTable", "pivotTables");
  if (!tablePath) return null;
  const table = parse(tablePath).documentElement;
  const nodes = (root, kind) => [...root.getElementsByTagNameNS(main, kind)];
  const location = nodes(table, "location")[0];
  if (!/^A1:B(?:[1-9]\d?|100)$/.test(location?.getAttribute("ref") ?? "") ||
      nodes(table, "colFields").length || nodes(table, "pageFields").length ||
      table.getAttribute("rowGrandTotals") !== "0" || table.getAttribute("colGrandTotals") !== "0") return null;
  const groups = nodes(table, "field");
  const values = nodes(table, "dataField");
  if (groups.length !== 1 || values.length !== 1) return null;
  const cache = nodes(workbook, "pivotCache").find((node) => node.getAttribute("cacheId") === table.getAttribute("cacheId"));
  const cachePath = related("xl/workbook.xml", "pivotCacheDefinition", "pivotCache", cache?.getAttributeNS(office, "id"));
  if (!cache || !cachePath) return null;
  const definition = parse(cachePath);
  const origin = nodes(definition, "worksheetSource")[0];
  if (!origin || nodes(definition, "cacheSource")[0]?.getAttribute("type") !== "worksheet") return null;
  const range = origin.getAttribute("ref")?.replaceAll("$", "").toUpperCase();
  const bounds = rangePattern.exec(range);
  const source = sheets.findIndex(({ name }) => name?.toUpperCase() === origin.getAttribute("sheet")?.toUpperCase());
  if (!bounds || source < 0 || source === worksheetIndex) return null;
  const left = bounds[1].charCodeAt(0);
  const right = bounds[3].charCodeAt(0);
  const group = Number(groups[0].getAttribute("x") ?? NaN) + left;
  const measure = Number(values[0].getAttribute("fld") ?? NaN) + left;
  const aggregation = values[0].getAttribute("subtotal") ?? "sum";
  if (![group, measure].every((column) => Number.isInteger(column) && column >= left && column <= right) ||
      group === measure || !["sum", "count", "average"].includes(aggregation)) return null;
  return { source, range, group: String.fromCharCode(group), measure: String.fromCharCode(measure), aggregate: aggregation };
}
