import { parseChartRange } from "./sheet-model.js";

const chartNs = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const drawingNs = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const mainNs = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const artNs = "http://schemas.openxmlformats.org/drawingml/2006/main";
const relationshipNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageNs = "http://schemas.openxmlformats.org/package/2006/relationships";

function link(type, target) {
  return `<Relationships xmlns="${packageNs}"><Relationship Id="rId1" Type="${relationshipNs}/${type}" Target="${target}"/></Relationships>`;
}

function points(values, encode) {
  return values.map((value, index) => value === "" ? "" : `<c:pt idx="${index}"><c:v>${encode(value)}</c:v></c:pt>`).join("");
}

export function writeWorksheetChart(files, overrides, id, name, chart, valueAt, xml) {
  const prefix = "'" + name.replaceAll("'", "''") + "'!";
  const ref = (column) => xml(`${prefix}$${column}$${chart.first + 1}:$${column}$${chart.last}`);
  const header = valueAt(chart.values + chart.first) || "Values";
  const labels = [];
  const values = [];
  for (let row = chart.first + 1; row <= chart.last; row++) {
    const value = String(valueAt(chart.values + row)).trim();
    labels.push(valueAt(chart.labels + row));
    values.push(value && Number.isFinite(Number(value)) ? Number(value) : "");
  }
  const count = `<c:ptCount val="${labels.length}"/>`;
  const chartPath = `xl/charts/chart${id}.xml`;
  files[chartPath] = `<c:chartSpace xmlns:c="${chartNs}"><c:chart><c:plotArea>
    <c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/>
      <c:ser><c:idx val="0"/><c:order val="0"/>
        <c:tx><c:strRef><c:f>${xml(prefix + chart.values + chart.first)}</c:f><c:strCache><c:ptCount val="1"/>${points([header], xml)}</c:strCache></c:strRef></c:tx>
        <c:cat><c:strRef><c:f>${ref(chart.labels)}</c:f><c:strCache>${count}${points(labels, xml)}</c:strCache></c:strRef></c:cat>
        <c:val><c:numRef><c:f>${ref(chart.values)}</c:f><c:numCache><c:formatCode>General</c:formatCode>${count}${points(values, xml)}</c:numCache></c:numRef></c:val>
      </c:ser><c:gapWidth val="120"/><c:axId val="10"/><c:axId val="100"/>
    </c:barChart>
    <c:catAx><c:axId val="10"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:crossAx val="100"/><c:crosses val="autoZero"/><c:lblOffset val="100"/></c:catAx>
    <c:valAx><c:axId val="100"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:majorGridlines/><c:crossAx val="10"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>
    </c:plotArea><c:legend><c:legendPos val="b"/></c:legend><c:plotVisOnly val="0"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
  const drawingPath = `xl/drawings/drawing${id}.xml`;
  files[drawingPath] = `<wsDr xmlns="${drawingNs}" xmlns:a="${artNs}" xmlns:c="${chartNs}" xmlns:r="${relationshipNs}">
    <oneCellAnchor><from><col>${chart.values.charCodeAt(0) - 63}</col><colOff>0</colOff><row>${chart.first - 1}</row><rowOff>0</rowOff></from><ext cx="4754880" cy="2743200"/>
      <graphicFrame><nvGraphicFramePr><cNvPr id="1" name="Bar chart"/><cNvGraphicFramePr/></nvGraphicFramePr><xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xfrm>
      <a:graphic><a:graphicData uri="${chartNs}"><c:chart r:id="rId1"/></a:graphicData></a:graphic></graphicFrame><clientData/>
    </oneCellAnchor></wsDr>`;
  files[`xl/worksheets/_rels/sheet${id}.xml.rels`] = link("drawing", `../drawings/drawing${id}.xml`);
  files[`xl/drawings/_rels/drawing${id}.xml.rels`] = link("chart", `../charts/chart${id}.xml`);
  overrides.push(`<Override PartName="/${chartPath}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`,
    `<Override PartName="/${drawingPath}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
}

function relatedPart(files, parse, path, id, type, folder) {
  const relationshipPath = path.replace(/\/([^/]+)$/, "/_rels/$1.rels");
  if (!id || !Object.hasOwn(files, relationshipPath)) return null;
  const relationship = [...parse(relationshipPath).getElementsByTagNameNS(packageNs, "Relationship")].find((link) =>
    link.getAttribute("Id") === id && link.getAttribute("Type")?.endsWith("/" + type) && link.getAttribute("TargetMode") !== "External");
  const target = relationship?.getAttribute("Target") ?? "";
  const match = /^(?:\.\.\/|\/xl\/)(drawings|charts)\/([\w.-]+\.xml)$/.exec(target);
  if (!match || match[1] !== folder) return null;
  const destination = `xl/${folder}/${match[2]}`;
  return Object.hasOwn(files, destination) ? destination : null;
}

function sheetRange(reference, name) {
  const match = /^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Z])\$?([1-9]\d?|100)(?::\$?([A-Z])\$?([1-9]\d?|100))?$/i.exec(reference ?? "");
  if (!match || (match[1]?.replaceAll("''", "'") ?? match[2]).toUpperCase() !== name.toUpperCase()) return null;
  const [, , , firstColumn, firstRow, lastColumn = firstColumn, lastRow = firstRow] = match;
  if (firstColumn.toUpperCase() !== lastColumn.toUpperCase()) return null;
  return { column: firstColumn.toUpperCase(), first: Number(firstRow), last: Number(lastRow) };
}

export function readWorksheetChart(files, parse, worksheet, path, name) {
  const drawing = worksheet.getElementsByTagNameNS(mainNs, "drawing")[0];
  const drawingPath = relatedPart(files, parse, path, drawing?.getAttributeNS(relationshipNs, "id"), "drawing", "drawings");
  if (!drawingPath) return null;
  const chartLink = parse(drawingPath).getElementsByTagNameNS(chartNs, "chart")[0];
  const chartPath = relatedPart(files, parse, drawingPath, chartLink?.getAttributeNS(relationshipNs, "id"), "chart", "charts");
  if (!chartPath) return null;
  const chart = parse(chartPath).getElementsByTagNameNS(chartNs, "barChart")[0];
  const series = chart?.getElementsByTagNameNS(chartNs, "ser");
  if (series?.length !== 1 || chart.getElementsByTagNameNS(chartNs, "barDir")[0]?.getAttribute("val") !== "bar") return null;
  const read = (node) => sheetRange(series[0].getElementsByTagNameNS(chartNs, node)[0]?.getElementsByTagNameNS(chartNs, "f")[0]?.textContent, name);
  const labels = read("cat");
  const values = read("val");
  if (!labels || !values || labels.first !== values.first || labels.last !== values.last || labels.first < 2) return null;
  return parseChartRange(`${labels.column}${labels.first - 1}:${values.column}${values.last}`);
}
