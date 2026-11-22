import { openPdfRaster, renderPdfPage } from "./pdf-render.js";

const markTypes = {
  note: { label: "Sticky note", subtype: "Text", color: [1, 0.77, 0.22] },
  highlight: { label: "Highlight", subtype: "Highlight", color: [1, 0.84, 0.16] },
  underline: { label: "Underline", subtype: "Underline", color: [0.2, 0.43, 0.7] },
  strike: { label: "Strikeout", subtype: "StrikeOut", color: [0.76, 0.19, 0.25] },
  box: { label: "Rectangle", subtype: "Square", color: [0.29, 0.2, 0.65] },
  ink: { label: "Freehand ink", subtype: "Ink", color: [0.15, 0.32, 0.68] },
  stamp: { label: "Stamp", subtype: "Stamp", color: [0.18, 0.34, 0.60] },
};
const inkWidth = 2;
const stampText = { Draft: "DRAFT", ForComment: "FOR COMMENT", Approved: "APPROVED", Final: "FINAL" };

function stampAppearance(pdf, quad, rect, label, color) {
  const [topLeft, , bottomLeft, bottomRight] = quad;
  const [x, y, right, top] = rect;
  const [leftX, leftY] = bottomLeft;
  const matrix = [(bottomRight[0] - leftX) / 100, (bottomRight[1] - leftY) / 100,
    (topLeft[0] - leftX) / 30, (topLeft[1] - leftY) / 30, leftX - x, leftY - y];
  const rgb = color.join(" ");
  const font = pdf.context.register(pdf.context.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Helvetica-Bold" }));
  const origin = 50 - label.length * 3.5;
  const commands = `q ${matrix.map((value) => value.toFixed(5)).join(" ")} cm ${rgb} RG ${rgb} rg 2 w 2 2 96 26 re S BT /F1 11 Tf ${origin} 11 Td (${label}) Tj ET Q`;
  return pdf.context.register(pdf.context.flateStream(commands, {
    Type: "XObject", Subtype: "Form", BBox: [0, 0, right - x, top - y], Resources: { Font: { F1: font } },
  }));
}

function editableComment(annotation, { PDFName, PDFNumber }) {
  const flags = annotation.get(PDFName.of("F"));
  return (!(flags instanceof PDFNumber) || !(flags.asNumber() & (64 | 128 | 512))) &&
    !annotation.has(PDFName.of("RC"));
}

function replyParents(slots, { PDFDict, PDFName }) {
  return new Set(slots.filter((annotation) => annotation instanceof PDFDict)
    .map((annotation) => annotation.lookup(PDFName.of("IRT"))).filter(Boolean));
}

function coordinatesOf(array, { PDFArray, PDFNumber }) {
  if (!(array instanceof PDFArray) || !array.size() || array.size() % 2) return null;
  const values = Array.from({ length: array.size() }, (_, index) => array.lookup(index));
  return values.every((value) => value instanceof PDFNumber && Number.isFinite(value.asNumber()))
    ? values.map((value) => value.asNumber()) : null;
}

function markGeometry(annotation, lib) {
  const { PDFName, PDFArray } = lib;
  const read = (name) => annotation.lookup(PDFName.of(name));
  const rect = coordinatesOf(read("Rect"), lib);
  if (rect?.length !== 4 || rect[2] <= rect[0] || rect[3] <= rect[1] || annotation.has(PDFName.of("Path"))) return null;
  const subtype = read("Subtype")?.toString();
  if (["/Highlight", "/Underline", "/StrikeOut"].includes(subtype)) {
    const quad = coordinatesOf(read("QuadPoints"), lib);
    return quad?.length % 8 === 0 ? { rect, quad } : null;
  }
  if (subtype === "/Ink") {
    const list = read("InkList");
    if (!(list instanceof PDFArray) || !list.size()) return null;
    const strokes = Array.from({ length: list.size() }, (_, index) => coordinatesOf(list.lookup(index), lib));
    return strokes.every(Boolean) ? { rect, strokes } : null;
  }
  return { rect };
}

function repositionMark(page, annotation, geometry, popups, center, lib) {
  if (!geometry || center.length !== 2 || !center.every(Number.isFinite)) throw new Error("This mark cannot be moved.");
  const { rect, quad, strokes } = geometry;
  const [dx, dy] = center.map((coordinate, axis) => coordinate - (rect[axis] + rect[axis + 2]) / 2);
  const offset = (coordinates) => coordinates.map((coordinate, index) => coordinate + (index % 2 ? dy : dx));
  const moved = offset(rect);
  const { x, y, width, height } = page.getCropBox();
  if (moved[0] < x - 0.001 || moved[1] < y - 0.001 || moved[2] > x + width + 0.001 || moved[3] > y + height + 0.001) {
    throw new Error("Keep the entire mark inside the page.");
  }
  const { PDFName } = lib;
  const set = (target, key, value) => target.set(PDFName.of(key), page.doc.context.obj(value));
  set(annotation, "Rect", moved);
  if (quad) set(annotation, "QuadPoints", offset(quad));
  if (strokes) set(annotation, "InkList", strokes.map(offset));
  for (const popup of popups) {
    const popupRect = coordinatesOf(popup.lookup(PDFName.of("Rect")), lib);
    if (popupRect?.length === 4) set(popup, "Rect", offset(popupRect));
  }
}

function removalSlots(annotations, targets, lib) {
  const { PDFDict, PDFName } = lib;
  const slots = Array.from({ length: annotations.size() }, (_, index) => annotations.lookup(index));
  const replies = replyParents(slots, lib);
  const removals = new Set();
  for (const index of targets) {
    const mark = slots[index];
    if (mark.has(PDFName.of("IRT")) || replies.has(mark)) return null;
    removals.add(index);
    const popup = mark.lookup(PDFName.of("Popup"));
    for (const [position, annotation] of slots.entries()) {
      if (!(annotation instanceof PDFDict) || annotation.get(PDFName.of("Subtype"))?.toString() !== "/Popup") continue;
      if (annotation === popup || annotation.lookup(PDFName.of("Parent")) === mark) removals.add(position);
    }
  }
  return removals;
}

export function readPdfComments(pdf, lib) {
  const { PDFName, PDFDict, PDFHexString, PDFString } = lib;
  const kinds = new Map(Object.entries(markTypes).map(([kind, type]) => ["/" + type.subtype, kind]));
  return pdf.getPages().flatMap((page, pageIndex) => {
    const annotations = page.node.Annots();
    const slots = Array.from({ length: annotations?.size() ?? 0 }, (_, index) => annotations.lookup(index));
    const replies = replyParents(slots, lib);
    const result = [];
    for (const [index, annotation] of slots.entries()) {
      if (!(annotation instanceof PDFDict) || !editableComment(annotation, lib)) continue;
      const subtype = annotation.get(PDFName.of("Subtype"))?.toString();
      const kind = kinds.get(subtype);
      if (!kind) continue;
      const contents = annotation.get(PDFName.of("Contents"));
      const text = contents instanceof PDFHexString || contents instanceof PDFString ? contents.decodeText() : "";
      const removable = !annotation.has(PDFName.of("IRT")) && !replies.has(annotation);
      const movable = removable && Boolean(markGeometry(annotation, lib));
      result.push({ pageIndex, kind, text, original: { index, subtype, text, removable, movable } });
    }
    return result;
  });
}

export function addPdfComments(pdf, entries, lib) {
  const { PDFName, PDFHexString, PDFDict } = lib;
  const removals = new Map();
  for (const entry of entries) {
    const page = pdf.getPage(entry.pageIndex);
    if (entry.original) {
      if (!entry.removed && !entry.center && entry.text === entry.original.text) continue;
      const annotation = page.node.Annots()?.lookup(entry.original.index);
      if (!(annotation instanceof PDFDict) || annotation.get(PDFName.of("Subtype"))?.toString() !== entry.original.subtype ||
          !editableComment(annotation, lib)) throw new Error("An original PDF comment could not be matched.");
      if (entry.removed) {
        const indexes = removals.get(page.node.Annots()) ?? [];
        indexes.push(entry.original.index);
        removals.set(page.node.Annots(), indexes);
      } else {
        if (entry.center) {
          const annotations = page.node.Annots();
          const related = removalSlots(annotations, [entry.original.index], lib);
          if (!related) throw new Error("A threaded annotation cannot be moved.");
          const popups = [...related].filter((index) => index !== entry.original.index).map((index) => annotations.lookup(index));
          repositionMark(page, annotation, markGeometry(annotation, lib), popups, entry.center, lib);
        }
        if (entry.text !== entry.original.text) annotation.set(PDFName.of("Contents"), PDFHexString.fromText(entry.text));
      }
      continue;
    }
    const type = markTypes[entry.kind];
    const properties = {
      Type: "Annot", Subtype: type.subtype, P: page.ref, C: type.color, F: 4,
    };
    if (entry.text) properties.Contents = PDFHexString.fromText(entry.text);
    if (entry.kind === "note") {
      const [x, y] = entry.point;
      properties.Rect = [x - 8, y - 8, x + 8, y + 8];
      properties.Name = PDFName.of("Comment");
    } else {
      const points = entry.kind === "ink" ? entry.path : entry.quad;
      const xs = points.map(([x]) => x);
      const ys = points.map(([, y]) => y);
      const padding = entry.kind === "stamp" ? 0 : ["box", "ink"].includes(entry.kind) ? 2 : 1;
      properties.Rect = [Math.min(...xs) - padding, Math.min(...ys) - padding, Math.max(...xs) + padding, Math.max(...ys) + padding];
      if (entry.kind === "ink") {
        const [x0, y0, x1, y1] = properties.Rect;
        const commands = points.map(([x, y], index) =>
          `${(x - x0).toFixed(3)} ${(y - y0).toFixed(3)} ${index ? "l" : "m"}`).join("\n");
        const appearance = pdf.context.flateStream(`q ${type.color.join(" ")} RG ${inkWidth} w 1 J 1 j\n${commands}\nS Q`, {
          Type: "XObject", Subtype: "Form", BBox: [0, 0, x1 - x0, y1 - y0], Resources: {},
        });
        properties.InkList = [points.flat()];
        properties.BS = { W: inkWidth, S: "S" };
        properties.AP = { N: pdf.context.register(appearance) };
      } else if (entry.kind === "stamp") {
        const stamp = Object.hasOwn(stampText, entry.stamp) ? entry.stamp : "Draft";
        properties.Name = PDFName.of(stamp);
        properties.AP = { N: stampAppearance(pdf, entry.quad, properties.Rect, stampText[stamp], type.color) };
      } else if (entry.kind === "box") properties.BS = { W: 2, S: "S" };
      else properties.QuadPoints = entry.quad.flat();
    }
    const annotation = pdf.context.obj(properties);
    page.node.addAnnot(pdf.context.register(annotation));
  }
  for (const [annotations, indexes] of removals) {
    const slots = removalSlots(annotations, indexes, lib);
    if (!slots) throw new Error("A threaded annotation cannot be removed.");
    for (const index of [...slots].sort((left, right) => right - left)) annotations.remove(index);
  }
}

export function bindPdfComments(sources, preview) {
  const dialog = document.querySelector("#pdf-comments-dialog");
  const form = dialog.querySelector("form");
  const { source, page, kind, stamp, left, top, width, height, text } = form.elements;
  const canvas = dialog.querySelector("canvas");
  const list = dialog.querySelector("ol");
  const status = dialog.querySelector("[role=status]");
  const download = dialog.querySelector("[data-export]");
  const close = dialog.querySelector("[data-close]");
  const area = form.querySelector("[data-area]");
  const add = form.querySelector("[type=submit]");
  const allControls = [...form.querySelectorAll("input,select,textarea,button"), close, download];
  const entries = [];
  let task;
  let raster;
  let viewport;
  let busy = false;
  let draft = false;
  let anchor;
  let ink;
  const discard = () => !(draft || text.value.trim()) || window.confirm("Discard unsaved PDF comments?");

  function enableControls() {
    for (const control of [...allControls, ...list.querySelectorAll("textarea, input, button")]) control.disabled = busy || control.hasAttribute("data-removed");
    add.disabled = busy || !viewport;
    download.disabled = busy || !entries.some((entry) => !entry.original || entry.removed || entry.center || entry.text !== entry.original.text);
    updateKind();
  }

  function updateKind() {
    const drawing = kind.value === "ink";
    const stamping = kind.value === "stamp";
    area.hidden = kind.value === "note" || drawing;
    form.querySelector("[data-position]").hidden = drawing;
    form.querySelector("[data-ink-help]").hidden = !drawing;
    form.querySelector("[data-stamp-options]").hidden = !stamping;
    stamp.disabled = busy || !stamping;
    add.hidden = drawing;
    for (const field of [left, top]) field.disabled = busy || drawing;
    for (const field of [width, height]) field.disabled = busy || area.hidden;
    text.required = kind.value === "note";
  }

  function paintStroke(context, points) {
    const color = markTypes.ink.color.map((value) => Math.round(value * 255));
    context.save();
    context.strokeStyle = `rgb(${color.join(",")})`;
    context.lineWidth = inkWidth * canvas.width / viewport.width;
    context.lineCap = context.lineJoin = "round";
    context.beginPath();
    for (const [index, [x, y]] of points.entries()) {
      const method = index ? "lineTo" : "moveTo";
      context[method](x * canvas.width, y * canvas.height);
    }
    context.stroke();
    context.restore();
  }

  function drawMarks() {
    const context = canvas.getContext("2d");
    for (const comment of entries.filter((entry) => entry.pageIndex === page.selectedIndex)) {
      if (comment.original) continue;
      if (comment.kind === "ink") {
        paintStroke(context, comment.points);
        continue;
      }
      const x = comment.left * canvas.width;
      const y = comment.top * canvas.height;
      const w = comment.width * canvas.width;
      const h = comment.height * canvas.height;
      const rgb = markTypes[comment.kind].color.map((value) => Math.round(value * 255)).join(",");
      context.fillStyle = `rgba(${rgb},0.36)`;
      context.strokeStyle = `rgb(${rgb})`;
      context.lineWidth = 3;
      if (comment.kind === "note") {
        context.beginPath();
        context.arc(x, y, 10, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      } else if (comment.kind === "highlight") context.fillRect(x, y, w, h);
      else if (comment.kind === "box") context.strokeRect(x, y, w, h);
      else if (comment.kind === "stamp") {
        context.save();
        context.translate(x, y);
        context.scale(w / 100, h / 30);
        context.fillStyle = `rgb(${rgb})`;
        context.lineWidth = 2;
        context.strokeRect(2, 2, 96, 26);
        context.font = "bold 11px Helvetica, Arial, sans-serif";
        context.textAlign = "center";
        context.fillText(stampText[comment.stamp], 50, 19);
        context.restore();
      }
      else {
        const line = comment.kind === "underline" ? y + h : y + h / 2;
        context.beginPath();
        context.moveTo(x, line);
        context.lineTo(x + w, line);
        context.stroke();
      }
    }
  }

  async function draw() {
    anchor = ink = undefined;
    busy = true;
    viewport = undefined;
    canvas.hidden = true;
    enableControls();
    try {
      viewport = await renderPdfPage(raster, page.selectedIndex, canvas, 0, 1600);
      drawMarks();
      canvas.hidden = false;
      status.textContent = "Click to place a note or drag to set a markup area.";
    } catch (error) {
      status.textContent = error.message || "The page could not be rendered.";
    } finally { busy = false; enableControls(); }
  }

  function moveControls(entry, index) {
    const controls = document.createElement("details");
    controls.open = Boolean(entry.position);
    const summary = document.createElement("summary");
    summary.textContent = "Move mark";
    const positions = document.createElement("div");
    positions.className = "pdf-redact-fields";
    const fields = ["Center from left (%)", "Center from top (%)"].map((title, axis) => {
      const label = document.createElement("label");
      label.textContent = title;
      const field = document.createElement("input");
      field.type = "number";
      field.min = 0;
      field.max = 100;
      field.step = "any";
      field.required = true;
      if (entry.position) field.value = entry.position[axis];
      label.append(field);
      positions.append(label);
      return field;
    });
    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "button button-outline";
    apply.textContent = "Preview move";
    apply.addEventListener("click", async () => {
      if (busy || !raster || !fields.every((field) => field.reportValidity())) return;
      const position = fields.map((field) => field.valueAsNumber);
      busy = true;
      enableControls();
      try {
        const view = (await raster.getPage(entry.pageIndex + 1)).getViewport({ scale: 1 });
        const center = view.convertToPdfPoint(position[0] / 100 * view.width, position[1] / 100 * view.height);
        await updatePreview(entry, index, { position, center });
      } catch (error) {
        status.textContent = error.message || "Could not read the page position.";
      } finally {
        busy = false;
        enableControls();
      }
    });
    controls.append(summary, positions, apply);
    if (entry.center) {
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "button button-outline";
      reset.textContent = "Reset position";
      reset.addEventListener("click", () => {
        if (!busy) void updatePreview(entry, index, { position: undefined, center: undefined });
      });
      controls.append(reset);
    }
    return controls;
  }

  function renderEntries() {
    list.replaceChildren(...entries.map((entry, index) => {
      const item = document.createElement("li");
      const label = document.createElement("label");
      const field = document.createElement("textarea");
      const remove = document.createElement("button");
      const name = entry.kind === "stamp" && entry.stamp ? stampText[entry.stamp] + " stamp" : markTypes[entry.kind].label;
      label.textContent = `${entry.original ? "Existing " : ""}${name} ${index + 1} · Page ${entry.pageIndex + 1}`;
      field.rows = 2;
      field.maxLength = 1000;
      field.value = entry.text;
      field.addEventListener("input", () => { entry.text = field.value; draft = true; enableControls(); });
      label.append(field);
      if (entry.original) {
        item.append(label);
        if (entry.original.removable) {
          field.toggleAttribute("data-removed", Boolean(entry.removed));
          remove.type = "button";
          remove.className = "button button-outline";
          remove.textContent = entry.removed ? "Restore mark" : "Remove in copy";
          remove.addEventListener("click", () => {
            if (!busy) void updatePreview(entry, index, { removed: !entry.removed });
          });
          item.append(remove);
        }
        if (entry.original.movable && !entry.removed) item.append(moveControls(entry, index));
        return item;
      }
      remove.type = "button";
      remove.className = "button button-outline";
      remove.textContent = "Remove mark";
      remove.addEventListener("click", () => {
        if (busy) return;
        entries.splice(index, 1);
        draft = true;
        renderEntries();
        if (entry.pageIndex === page.selectedIndex) void draw();
      });
      item.append(label, remove);
      return item;
    }));
    enableControls();
  }

  async function updatePreview(entry, index, changes) {
    busy = true;
    const previous = Object.fromEntries(Object.keys(changes).map((key) => [key, entry[key]]));
    Object.assign(entry, changes);
    enableControls();
    let previewTask;
    try {
      const lib = window.PDFLib;
      let bytes = new Uint8Array(await sources[source.value].file.arrayBuffer());
      const altered = entries.filter((item) => item.removed || item.center);
      if (altered.length) {
        const output = await lib.PDFDocument.load(bytes, { updateMetadata: false });
        addPdfComments(output, altered, lib);
        bytes = await output.save({ updateFieldAppearances: false });
      }
      previewTask = openPdfRaster(bytes);
      const rasterDocument = await previewTask.promise;
      void task?.destroy().catch(() => {});
      task = previewTask;
      raster = rasterDocument;
      draft = true;
      page.selectedIndex = entry.pageIndex;
      await draw();
      renderEntries();
      const focus = Object.hasOwn(changes, "center") ? "summary" : "button";
      list.children[index]?.querySelector(focus)?.focus();
    } catch (error) {
      void previewTask?.destroy().catch(() => {});
      Object.assign(entry, previous);
      status.textContent = error.message || "Could not update the annotation preview.";
    } finally {
      busy = false;
      enableControls();
    }
  }

  async function load() {
    busy = true;
    viewport = undefined;
    canvas.hidden = true;
    entries.length = 0;
    text.value = "";
    draft = false;
    renderEntries();
    try {
      await task?.destroy();
      const pdf = sources[source.value].document;
      const lib = window.PDFLib;
      if (pdf.catalog.has(lib.PDFName.of("Perms")) || pdf.catalog.getAcroForm()?.dict.has(lib.PDFName.of("XFA")) ||
        pdf.getForm().getFields().some((field) => field instanceof lib.PDFSignature)) {
        throw new Error("Choose an unsigned PDF without XFA fields.");
      }
      task = openPdfRaster(new Uint8Array(await sources[source.value].file.arrayBuffer()));
      raster = await task.promise;
      page.replaceChildren(...Array.from({ length: raster.numPages }, (_, index) => new Option(index + 1)));
      for (const entry of readPdfComments(pdf, lib)) entries.push(entry);
      renderEntries();
      await draw();
    } catch (error) {
      page.replaceChildren();
      status.textContent = error.message || "Could not open the PDF.";
    } finally { busy = false; enableControls(); }
  }

  document.querySelector("#pdf-comments-open").addEventListener("click", () => {
    source.replaceChildren(...sources.map((item, index) => new Option(item.file.name, index)));
    dialog.showModal();
    void load();
  });
  source.addEventListener("change", () => {
    if (discard()) void load();
    else source.value = source.dataset.selected ?? "0";
    source.dataset.selected = source.value;
  });
  page.addEventListener("change", () => void draw());
  kind.addEventListener("change", updateKind);
  close.addEventListener("click", () => { if (!busy && discard()) dialog.close(); });
  dialog.addEventListener("cancel", (event) => { if (busy || !discard()) event.preventDefault(); });
  dialog.addEventListener("close", () => {
    void task?.destroy().catch(() => {});
    task = raster = viewport = undefined;
    anchor = ink = undefined;
    canvas.width = canvas.height = 0;
    source.dataset.selected = "0";
  });
  function coordinates(event) {
    const rect = canvas.getBoundingClientRect();
    const clamp = (value) => Math.min(100, Math.max(0, value * 100));
    return [clamp((event.clientX - rect.left) / rect.width), clamp((event.clientY - rect.top) / rect.height)];
  }
  canvas.addEventListener("click", (event) => {
    if (busy || kind.value !== "note") return;
    const [x, y] = coordinates(event);
    left.value = x.toFixed(1);
    top.value = y.toFixed(1);
    text.focus();
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (busy || kind.value === "note" || event.button !== 0 || !event.isPrimary) return;
    anchor = coordinates(event);
    if (kind.value === "ink") ink = [anchor.map((value) => value / 100)];
    canvas.setPointerCapture(event.pointerId);
  });
  function extendInk(event) {
    if (!ink || !viewport || busy || !event.isPrimary || ink.length >= 1200) return;
    const last = ink.at(-1);
    const next = coordinates(event).map((value) => value / 100);
    if (Math.hypot((last[0] - next[0]) * viewport.width, (last[1] - next[1]) * viewport.height) < 0.5) return;
    ink.push(next);
    paintStroke(canvas.getContext("2d"), [last, next]);
  }
  canvas.addEventListener("pointermove", extendInk);
  canvas.addEventListener("lostpointercapture", () => {
    anchor = undefined;
    if (!ink) return;
    ink = undefined;
    void draw();
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!anchor || !event.isPrimary) return;
    const [firstX, firstY] = anchor;
    anchor = undefined;
    if (busy) return;
    if (ink) {
      extendInk(event);
      const points = ink;
      ink = undefined;
      if (points.length < 2) return;
      entries.push({ kind: "ink", pageIndex: page.selectedIndex, points,
        path: points.map(([x, y]) => viewport.convertToPdfPoint(x * viewport.width, y * viewport.height)),
        text: text.value.trim() });
      text.value = "";
      draft = true;
      status.textContent = "Ink added to this page.";
      renderEntries();
      return;
    }
    const [x, y] = coordinates(event);
    left.value = Math.min(firstX, x).toFixed(1);
    top.value = Math.min(firstY, y).toFixed(1);
    width.value = Math.max(0.1, Math.abs(firstX - x)).toFixed(1);
    height.value = Math.max(0.1, Math.abs(firstY - y)).toFixed(1);
    add.focus();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy || !viewport || kind.value === "ink" || (kind.value === "note" && !text.value.trim())) return;
    const x = left.valueAsNumber / 100;
    const y = top.valueAsNumber / 100;
    const w = kind.value === "note" ? 0 : width.valueAsNumber / 100;
    const h = kind.value === "note" ? 0 : height.valueAsNumber / 100;
    if (x + w > 1.00001 || y + h > 1.00001) { status.textContent = "Keep the marked area inside the page."; return; }
    const pointAt = (a, b) => viewport.convertToPdfPoint(a * viewport.width, b * viewport.height);
    entries.push({
      kind: kind.value,
      pageIndex: page.selectedIndex,
      left: x, top: y, width: w, height: h,
      point: pointAt(x, y),
      quad: [pointAt(x, y), pointAt(x + w, y), pointAt(x, y + h), pointAt(x + w, y + h)],
      text: text.value.trim(),
      stamp: kind.value === "stamp" ? stamp.value : undefined,
    });
    text.value = "";
    draft = true;
    renderEntries();
    void draw();
  });
  download.addEventListener("click", async () => {
    if (busy || !entries.length) return;
    if (entries.some((entry) => !entry.original && entry.kind === "note" && !entry.text.trim())) { status.textContent = "Enter text for every new sticky note or remove the empty notes."; return; }
    busy = true;
    enableControls();
    try {
      const item = sources[source.value];
      const lib = window.PDFLib;
      const output = await lib.PDFDocument.load(await item.file.arrayBuffer(), { updateMetadata: false });
      addPdfComments(output, entries, lib);
      const file = new File([await output.save({ updateFieldAppearances: false })], item.file.name.replace(/\.pdf$/i, "") + "-reviewed.pdf", { type: "application/pdf" });
      preview(file, page.selectedIndex + 1);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(file);
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      draft = false;
      status.textContent = "Reviewed PDF downloaded with annotations.";
    } catch (error) { status.textContent = error.message || "Could not export the reviewed PDF."; }
    finally { busy = false; enableControls(); }
  });
}
