const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const office = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageNs = "http://schemas.openxmlformats.org/package/2006/relationships";

export function normalizeCellNote(note) {
  if (typeof note?.text !== "string" || !note.text.trim()) return null;
  return { text: note.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, 4000),
    author: typeof note.author === "string" && note.author.trim() ? note.author.replace(/[\u0000-\u001f]/g, "").slice(0, 255) : "Adigun Sheets" };
}

export function writeWorksheetNotes(files, overrides, id, notes, xml) {
  const entries = Object.entries(notes ?? {}).flatMap(([address, value]) => {
    const note = normalizeCellNote(value);
    return /^[A-Z][1-9]\d{0,3}$/.test(address) && note ? [[address, note]] : [];
  });
  if (!entries.length) return;
  const authors = [...new Set(entries.map(([, note]) => note.author))];
  const comments = entries.map(([address, note]) =>
    `<comment ref="${address}" authorId="${authors.indexOf(note.author)}"><text><t xml:space="preserve">${xml(note.text)}</t></text></comment>`);
  const shapes = entries.map(([address], index) =>
    `<v:shape id="_x0000_s${1025 + index}" type="#_x0000_t202" style="position:absolute;width:144pt;height:79pt;visibility:hidden" fillcolor="#ffffe1"><v:textbox/><x:ClientData ObjectType="Note"><x:AutoFill>False</x:AutoFill><x:Row>${Number(address.slice(1)) - 1}</x:Row><x:Column>${address.charCodeAt(0) - 65}</x:Column></x:ClientData></v:shape>`);
  const commentPath = `comments/note${id}.xml`;
  const drawingPath = `drawings/note${id}.vml`;
  files["xl/" + commentPath] = `<comments xmlns="${main}"><authors>${authors.map(author => `<author>${xml(author)}</author>`).join("")}</authors><commentList>${comments.join("")}</commentList></comments>`;
  files["xl/" + drawingPath] = `<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>${shapes.join("")}</xml>`;
  const relPath = `xl/worksheets/_rels/sheet${id}.xml.rels`;
  const rels = files[relPath] ?? `<Relationships xmlns="${packageNs}"></Relationships>`;
  files[relPath] = rels.replace("</Relationships>", `<Relationship Id="rIdNotes" Type="${office}/comments" Target="../${commentPath}"/><Relationship Id="rIdNotesDrawing" Type="${office}/vmlDrawing" Target="../${drawingPath}"/></Relationships>`);
  overrides.push(`<Override PartName="/xl/${commentPath}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>`,
    `<Override PartName="/xl/${drawingPath}" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>`);
  const worksheet = `xl/worksheets/sheet${id}.xml`;
  files[worksheet] = files[worksheet].replace("</worksheet>", `<legacyDrawing xmlns:r="${office}" r:id="rIdNotesDrawing"/></worksheet>`);
}

export function readWorksheetNotes(files, parse, relationships) {
  const notes = {};
  const relation = relationships.find(node => node.getAttribute("Type") === office + "/comments" && node.getAttribute("TargetMode") !== "External");
  const target = relation?.getAttribute("Target");
  const part = target?.startsWith("/xl/") ? target.slice(1) : target?.replace(/^\.\.\//, "xl/");
  if (!part || !/^xl\/(?:comments\/)?[\w.-]+\.xml$/.test(part) || !files[part]) return notes;
  const document = parse(part);
  const authors = document.getElementsByTagNameNS(main, "author");
  for (const comment of document.getElementsByTagNameNS(main, "comment")) {
    const address = comment.getAttribute("ref");
    const text = comment.getElementsByTagNameNS(main, "text")[0];
    const note = normalizeCellNote({ text: [...(text?.children ?? [])].flatMap(child =>
      child.localName === "t" ? [child.textContent] : child.localName === "r" ?
        [child.getElementsByTagNameNS(main, "t")[0]?.textContent ?? ""] : []).join(""),
    author: authors[Number(comment.getAttribute("authorId"))]?.textContent });
    if (/^[A-Z][1-9]\d{0,3}$/.test(address) && note && !note.author.startsWith("tc=")) notes[address] = note;
  }
  return notes;
}
