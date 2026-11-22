(() => {
  const $ = (id) => document.getElementById(id);
  const storageKey = "adigun-slides-v1";
  const maxSlides = 40;
  const blank = () => ({ title: "", content: "" });
  const newDeck = () => ({ name: "Untitled presentation", active: 0, slides: [blank()] });
  const slideShow = $("slide-show");
  const animationDialog = $("slide-animation-dialog");
  const animationForm = animationDialog.querySelector("form");
  const animationPanel = $("slide-animation-panel");
  const animationList = $("slide-animation-list");
  const transitionDialog = $("slide-transition-dialog");
  const transitionForm = transitionDialog.querySelector("form");
  const { normalizeTransition, transitionFrames, normalizeObjects, imageLimit, imageData } = window.AdigunPresentation;
  const effects = {
    fade: [{ opacity: 0 }, { opacity: 1 }],
    rise: [{ opacity: 0, transform: "translateY(24px)" }, { opacity: 1, transform: "translateY(0)" }],
    pulse: [{ transform: "scale(1)" }, { transform: "scale(1.04)" }, { transform: "scale(1)" }],
    exit: [{ opacity: 1 }, { opacity: 0 }],
    drift: [{ transform: "translateX(0)" }, { transform: "translateX(24px)" }, { transform: "translateX(0)" }],
  };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const playing = new Map();
  const effectTimers = new Set();
  let manualEffect = 0;
  let editingEffect;
  let transitioning;
  let advanceTimer;
  let deck = newDeck();
  let presentedSlide = 0;
  let draggedSlide = null;
  let selectedObject = null;
  const selectedObjects = new Set();

  function normalizeAnimation(animation) {
    const { effect, target, start, duration, delay } = animation || {};
    return {
      effect: Object.hasOwn(effects, effect) ? effect : "none",
      target: typeof target === "string" && (/^object:(?:[0-9]|1[0-9]|2[0-4])$/.test(target) || ["title", "content"].includes(target)) ? target : "both",
      start: start === "manual" ? start : "auto",
      duration: Number.isFinite(duration) && duration >= 0.1 && duration <= 5 ? duration : 0.6,
      delay: Number.isFinite(delay) && delay >= 0 && delay <= 10 ? delay : 0,
    };
  }

  function status(message) { $("slides-save").textContent = message; }
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(stored?.slides) && stored.slides.length) {
      const slides = stored.slides.slice(0, maxSlides).map((slide) => ({
        title: typeof slide?.title === "string" ? slide.title.slice(0, 120) : "",
        content: typeof slide?.content === "string" ? slide.content.slice(0, 1500) : "",
        theme: Object.hasOwn(window.AdigunPresentation.themes, slide?.theme) ? slide.theme : "paper",
        animations: (Array.isArray(slide?.animations) ? slide.animations : [slide?.animation]).slice(0, 16)
          .map(normalizeAnimation).filter((effect) => effect.effect !== "none"),
        hidden: slide?.hidden === true,
        notes: typeof slide?.notes === "string" ? slide.notes.slice(0, 4000) : "",
        transition: normalizeTransition(slide?.transition),
        objects: normalizeObjects(slide?.objects),
      }));
      const active = Number.isInteger(stored.active) ? Math.max(0, Math.min(stored.active, slides.length - 1)) : 0;
      deck = { name: typeof stored.name === "string" ? stored.name.slice(0, 100) : deck.name, active, slides };
    }
  } catch { status("The saved presentation could not be read."); }

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(deck));
      status("Saved on this device");
    } catch { status("Local saving is unavailable. Download a PowerPoint copy."); }
  }

  function renderList() {
    $("slide-list").replaceChildren(...deck.slides.map((slide, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-outline";
      const label = (index + 1) + ". " + (slide.title.trim() || "Untitled slide") + (slide.hidden ? " (hidden)" : "");
      const thumbnail = document.createElement("span");
      const heading = document.createElement("strong");
      const summary = document.createElement("span");
      thumbnail.className = "slide-thumbnail";
      thumbnail.setAttribute("aria-hidden", "true");
      heading.textContent = slide.title;
      summary.textContent = slide.content;
      thumbnail.append(heading, summary);
      applyTheme(thumbnail, slide.theme);
      const caption = document.createElement("span");
      caption.textContent = label;
      button.append(thumbnail, caption);
      button.setAttribute("aria-pressed", String(index === deck.active));
      button.addEventListener("click", () => {
        deck.active = index;
        save();
        render();
        $("slide-list").children[index].firstElementChild.focus();
      });
      item.draggable = true;
      item.addEventListener("dragstart", (event) => {
        draggedSlide = index;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(index + 1));
      });
      item.addEventListener("dragend", () => { draggedSlide = null; });
      item.addEventListener("dragover", (event) => {
        if (draggedSlide === null || draggedSlide === index) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      });
      item.addEventListener("drop", (event) => {
        if (draggedSlide === null || draggedSlide === index) return;
        event.preventDefault();
        const from = draggedSlide;
        draggedSlide = null;
        moveSlideTo(from, index);
      });
      item.append(button);
      return item;
    }));
  }

  function render() {
    selectedObject = null;
    selectedObjects.clear();
    const slide = deck.slides[deck.active];
    $("deck-title").value = deck.name;
    $("slide-title").value = slide.title;
    $("slide-content").value = slide.content;
    $("slide-notes").value = slide.notes || "";
    applyTheme($("slide-title").closest(".slides-paper"), slide.theme);
    for (const button of document.querySelectorAll("[data-slide-theme]")) {
      button.setAttribute("aria-pressed", String(button.dataset.slideTheme === (slide.theme || "paper")));
    }
    $("slide-add").disabled = deck.slides.length >= maxSlides;
    $("slide-duplicate").disabled = deck.slides.length >= maxSlides;
    $("slide-remove").disabled = deck.slides.length === 1;
    $("slide-earlier").disabled = deck.active === 0;
    $("slide-later").disabled = deck.active === deck.slides.length - 1;
    $("slide-hide").textContent = slide.hidden ? "Show slide" : "Hide slide";
    $("slide-hide").setAttribute("aria-pressed", String(Boolean(slide.hidden)));
    const allHidden = deck.slides.every((item) => item.hidden);
    $("slide-present").disabled = allHidden;
    $("slide-present-start").disabled = allHidden;
    $("slide-print-deck").disabled = allHidden;
    $("slide-status-index").textContent = `Slide ${deck.active + 1} of ${deck.slides.length}${slide.hidden ? " · Hidden in slideshow" : ""}`;
    renderList();
    renderObjects();
    renderEffectList();
  }

  function applyTheme(paper, theme) {
    const { themes } = window.AdigunPresentation;
    const palette = Object.hasOwn(themes, theme) ? themes[theme] : themes.paper;
    paper.style.setProperty("--slide-background", "#" + palette.background);
    paper.style.setProperty("--slide-text", "#" + palette.text);
  }

  for (const button of document.querySelectorAll("[data-slide-theme]")) {
    button.addEventListener("click", () => {
      deck.slides[deck.active].theme = button.dataset.slideTheme;
      save();
      render();
    });
  }

  function addSlide(slide) {
    deck.slides.splice(++deck.active, 0, slide);
    save();
    render();
    $("slide-title").focus();
  }

  function moveSlideTo(oldIndex, nextIndex) {
    const [slide] = deck.slides.splice(oldIndex, 1);
    deck.slides.splice(nextIndex, 0, slide);
    deck.active = nextIndex;
    save();
    render();
    $("slide-list").children[nextIndex].firstElementChild.focus();
  }

  $("deck-title").addEventListener("input", (event) => { deck.name = event.target.value; save(); });
  $("slide-title").addEventListener("input", (event) => { deck.slides[deck.active].title = event.target.value; save(); renderList(); });
  $("slide-content").addEventListener("input", (event) => { deck.slides[deck.active].content = event.target.value; save(); renderList(); });
  $("slide-notes").addEventListener("input", (event) => { deck.slides[deck.active].notes = event.target.value; save(); });
  $("slide-add").addEventListener("click", () => addSlide(blank()));
  $("slide-duplicate").addEventListener("click", () => addSlide(structuredClone(deck.slides[deck.active])));
  $("slide-earlier").addEventListener("click", () => moveSlideTo(deck.active, deck.active - 1));
  $("slide-later").addEventListener("click", () => moveSlideTo(deck.active, deck.active + 1));
  $("slide-hide").addEventListener("click", () => {
    deck.slides[deck.active].hidden = !deck.slides[deck.active].hidden;
    save();
    render();
  });
  $("slide-remove").addEventListener("click", () => {
    if (!window.confirm("Delete this slide from the presentation?")) return;
    deck.slides.splice(deck.active, 1);
    deck.active = Math.min(deck.active, deck.slides.length - 1);
    save();
    render();
    $("slide-title").focus();
  });

  const objectPanel = $("slide-object-panel");
  const objectForm = $("slide-object-form");
  const objectLayer = $("slide-object-layer");

  function placeObject(node, object) {
    for (const [key, value] of Object.entries({ left: object.x, top: object.y, width: object.width, height: object.height })) {
      node.style[key] = value + "%";
    }
    node.style.transform = `rotate(${object.rotation}deg)`;
  }

  function drawObjects(layer, objects = [], editable = false) {
    layer.replaceChildren(...objects.map((object, index) => {
      const node = document.createElement(editable ? "button" : "div");
      node.className = `slide-object slide-object-${object.kind}`;
      if (object.kind === "image") {
        const image = document.createElement("img");
        image.src = object.src;
        image.alt = object.text;
        image.draggable = false;
        node.append(image);
      } else node.textContent = object.text;
      node.style.setProperty("--object-fill", "#" + object.fill);
      placeObject(node, object);
      if (editable) {
        node.type = "button";
        node.setAttribute("aria-label", `${object.kind === "text" ? "Text box" : object.kind} ${index + 1}${object.text ? ": " + object.text : ""}`);
        node.setAttribute("aria-pressed", String(selectedObjects.has(index)));
        node.setAttribute("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight Shift+Enter");
        node.addEventListener("click", (event) => selectObject(index, true, event.shiftKey));
        node.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" || !event.shiftKey) return;
          event.preventDefault();
          selectObject(index, true, true);
        });
        node.addEventListener("pointerdown", (event) => {
          if (event.button !== 0 || event.shiftKey) return;
          const bounds = layer.getBoundingClientRect();
          const { clientX, clientY } = event;
          const members = groupMembers(objects, index);
          let moves = null;
          node.setPointerCapture(event.pointerId);
          const pointerMove = (position) => {
            if (!bounds.width || !bounds.height) return;
            moves = moveMembers(objects, members,
              (position.clientX - clientX) * 100 / bounds.width,
              (position.clientY - clientY) * 100 / bounds.height);
            for (const [member, move] of moves) placeObject(layer.children[member], move);
            if (index === selectedObject && layer.lastElementChild?.classList.contains("slide-resize-frame")) {
              placeObject(layer.lastElementChild, moves.get(index));
            }
          };
          const finish = (position) => {
            node.removeEventListener("pointermove", pointerMove);
            node.removeEventListener("pointerup", finish);
            node.removeEventListener("pointercancel", finish);
            if (position.type === "pointerup" && moves) {
              for (const [member, move] of moves) objects[member] = move;
              save();
              selectObject(index, true);
            } else {
              for (const member of members) placeObject(layer.children[member], objects[member]);
              if (index === selectedObject && layer.lastElementChild?.classList.contains("slide-resize-frame")) {
                placeObject(layer.lastElementChild, object);
              }
            }
          };
          node.addEventListener("pointermove", pointerMove);
          node.addEventListener("pointerup", finish);
          node.addEventListener("pointercancel", finish);
        });
      }
      return node;
    }));
  }

  function groupMembers(objects, index) {
    const group = objects[index]?.group;
    return group ? objects.flatMap((object, position) => object.group === group ? [position] : []) : [index];
  }

  function moveMembers(objects, members, dx, dy) {
    const selection = members.map((index) => objects[index]);
    const limit = (offset, position, size) => Math.min(
      Math.min(...selection.map((object) => 100 - object[position] - object[size])),
      Math.max(-Math.min(...selection.map((object) => object[position])), Math.round(offset * 10) / 10),
    );
    const x = limit(dx, "x", "width");
    const y = limit(dy, "y", "height");
    return new Map(members.map((index) => {
      const object = objects[index];
      const [moved] = normalizeObjects([{ ...object, x: object.x + x, y: object.y + y }]);
      return [index, moved];
    }));
  }

  function addResizeHandle(objects, index) {
    const object = objects[index];
    const node = objectLayer.children[index];
    const frame = document.createElement("div");
    frame.className = "slide-resize-frame";
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "slide-resize-handle";
    handle.setAttribute("aria-label", "Resize selected object");
    handle.setAttribute("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight");
    handle.title = "Drag to resize or use the arrow keys";
    frame.append(handle);
    placeObject(frame, object);
    objectLayer.append(frame);

    const angle = object.rotation * Math.PI / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    function resized(width, height, bounds) {
      const [size] = normalizeObjects([{ ...object, width, height }]);
      const horizontal = (size.width - object.width) * bounds.width / 200;
      const vertical = (size.height - object.height) * bounds.height / 200;
      // Keep the opposite corner fixed while the object's rotated center moves.
      const x = object.x + (horizontal * cosine - vertical * sine - horizontal) * 100 / bounds.width;
      const y = object.y + (horizontal * sine + vertical * cosine - vertical) * 100 / bounds.height;
      const [result] = normalizeObjects([{ ...size, x, y }]);
      return result;
    }
    function commit(result) {
      if (result.width === object.width && result.height === object.height) return;
      objects[index] = result;
      save();
      renderObjects();
      objectLayer.querySelector(".slide-resize-handle")?.focus();
    }
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const bounds = objectLayer.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const { clientX, clientY } = event;
      let preview = object;
      handle.setPointerCapture(event.pointerId);
      const move = (position) => {
        const dx = position.clientX - clientX;
        const dy = position.clientY - clientY;
        preview = resized(
          object.width + (dx * cosine + dy * sine) * 100 / bounds.width,
          object.height + (-dx * sine + dy * cosine) * 100 / bounds.height,
          bounds,
        );
        placeObject(node, preview);
        placeObject(frame, preview);
      };
      const finish = (position) => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", finish);
        handle.removeEventListener("lostpointercapture", finish);
        if (position.type === "pointerup") commit(preview);
        else {
          placeObject(node, object);
          placeObject(frame, object);
        }
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", finish);
      handle.addEventListener("lostpointercapture", finish);
    });
    handle.addEventListener("keydown", (event) => {
      const sizes = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (!Object.hasOwn(sizes, event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      const bounds = objectLayer.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const [width, height] = sizes[event.key];
      const step = event.shiftKey ? 5 : 1;
      commit(resized(object.width + width * step, object.height + height * step, bounds));
    });
  }

  function renderObjects() {
    const objects = deck.slides[deck.active].objects ?? [];
    const object = objects[selectedObject];
    const multiple = selectedObjects.size > 1;
    objectPanel.hidden = !object;
    objectForm.hidden = multiple;
    $("slide-object-alignment").hidden = !multiple;
    const grouped = multiple && [...selectedObjects].some((index) => objects[index]?.group);
    $("slide-object-heading").textContent = grouped ? "Grouped objects" : multiple ? "Align objects" : "Object properties";
    drawObjects(objectLayer, objects, true);
    if (multiple) {
      $("slide-object-selection-count").textContent = `${selectedObjects.size} objects selected`;
      $("slide-group-objects").hidden = grouped;
      $("slide-ungroup-objects").hidden = !grouped;
      for (const control of document.querySelectorAll("[data-align-objects]")) {
        control.disabled = grouped || (control.dataset.alignObjects.startsWith("distribute") && selectedObjects.size < 3);
      }
      return;
    }
    if (!object) return;
    addResizeHandle(objects, selectedObject);
    for (const key of ["text", "x", "y", "width", "height", "rotation"]) objectForm.elements[key].value = object[key];
    objectForm.elements.fill.value = "#" + object.fill;
    objectForm.elements.fill.disabled = ["text", "image"].includes(object.kind);
    $("slide-object-text-label").textContent = object.kind === "image" ? "Alternative text" : "Text";
    $("slide-object-front").disabled = selectedObject === objects.length - 1;
    $("slide-object-back").disabled = selectedObject === 0;
    $("slide-object-duplicate").disabled = objects.length >= 25;
  }

  function selectObject(index, focus = false, extend = false) {
    if (index !== null) animationPanel.hidden = true;
    if (!extend) selectedObjects.clear();
    if (index !== null) {
      const objects = deck.slides[deck.active].objects ?? [];
      const remove = extend && selectedObjects.has(index);
      for (const member of groupMembers(objects, index)) {
        if (remove) selectedObjects.delete(member);
        else selectedObjects.add(member);
      }
    }
    selectedObject = selectedObjects.has(index) ? index : [...selectedObjects].at(-1) ?? null;
    renderObjects();
    if (focus) objectLayer.children[index]?.focus();
  }

  function objectAxis(object, horizontal, aspect) {
    const radians = object.rotation * Math.PI / 180;
    const cosine = Math.abs(Math.cos(radians));
    const sine = Math.abs(Math.sin(radians));
    const center = horizontal ? object.x + object.width / 2 : object.y + object.height / 2;
    const size = horizontal ? object.width * cosine + object.height * sine / aspect :
      object.height * cosine + object.width * sine * aspect;
    return { center, start: center - size / 2, end: center + size / 2 };
  }

  for (const control of document.querySelectorAll("[data-align-objects]")) {
    control.addEventListener("click", () => {
      if (selectedObjects.size < 2) return;
      const mode = control.dataset.alignObjects;
      const distribute = mode.startsWith("distribute");
      if (distribute && selectedObjects.size < 3) return;
      const horizontal = ["left", "center", "right", "distribute-x"].includes(mode);
      const key = horizontal ? "x" : "y";
      const bounds = objectLayer.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const objects = deck.slides[deck.active].objects;
      const entries = [...selectedObjects].map((index) => ({
        index, axis: objectAxis(objects[index], horizontal, bounds.width / bounds.height),
      }));
      const first = Math.min(...entries.map(({ axis }) => axis.start));
      const last = Math.max(...entries.map(({ axis }) => axis.end));
      const edge = ["left", "top"].includes(mode) ? "start" : ["right", "bottom"].includes(mode) ? "end" : "center";
      const coordinate = { start: first, end: last, center: (first + last) / 2 }[edge];
      const objectSize = ({ axis }) => axis.end - axis.start;
      const space = last - first - entries.reduce((total, entry) => total + objectSize(entry), 0);
      if (distribute && space < -0.001) {
        status("Move the outer objects farther apart before distributing this selection.");
        return;
      }
      if (distribute) entries.sort((one, two) => one.axis.start - two.axis.start);
      let nextStart = first;
      const changes = entries.map(({ index, axis }) => {
        const offset = distribute ? nextStart - axis.start : coordinate - axis[edge];
        nextStart += axis.end - axis.start + space / (entries.length - 1);
        const requested = objects[index][key] + offset;
        const [item] = normalizeObjects([{ ...objects[index], [key]: requested }]);
        return { index, item, requested };
      });
      if (changes.some(({ item, requested }) => Math.abs(item[key] - requested) > 0.051)) {
        status("These objects cannot align there within the slide. Move or resize one and try again.");
        return;
      }
      for (const { index, item } of changes) objects[index] = item;
      save();
      renderObjects();
    });
  }
  $("slide-alignment-close").addEventListener("click", () => {
    const index = selectedObject;
    selectObject(null);
    objectLayer.children[index]?.focus();
  });
  $("slide-group-objects").addEventListener("click", () => {
    if (selectedObjects.size < 2) return;
    const slide = deck.slides[deck.active];
    const before = [...slide.objects];
    const members = before.filter((_, index) => selectedObjects.has(index));
    if (members.some((object) => object.group)) return;
    const used = new Set(before.map((object) => object.group));
    const group = Array.from({ length: 25 }, (_, index) => index + 1).find((id) => !used.has(id));
    for (const object of members) object.group = group;
    const last = Math.max(...selectedObjects);
    slide.objects = before.flatMap((object, index) =>
      index === last ? members : selectedObjects.has(index) ? [] : [object]);
    remapEffects(slide, before);
    save();
    selectObject(slide.objects.indexOf(members.at(-1)), true);
  });
  $("slide-ungroup-objects").addEventListener("click", () => {
    const objects = deck.slides[deck.active].objects;
    for (const index of selectedObjects) delete objects[index].group;
    save();
    renderObjects();
    $("slide-group-objects").focus();
  });

  objectLayer.addEventListener("keydown", (event) => {
    const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!Object.hasOwn(offsets, event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    const index = Array.prototype.indexOf.call(objectLayer.children, event.target);
    const objects = deck.slides[deck.active].objects;
    const object = objects?.[index];
    if (!object) return;
    event.preventDefault();
    const [horizontal, vertical] = offsets[event.key];
    const step = event.shiftKey ? 5 : 1;
    const moves = moveMembers(objects, groupMembers(objects, index), horizontal * step, vertical * step);
    if (moves.get(index).x === object.x && moves.get(index).y === object.y) return;
    for (const [member, moved] of moves) objects[member] = moved;
    save();
    selectObject(index, true);
  });

  for (const button of document.querySelectorAll("[data-slide-object]")) {
    button.addEventListener("click", () => {
      const slide = deck.slides[deck.active];
      const objects = slide.objects ??= [];
      if (objects.length >= 25) { status("A slide can contain up to 25 objects."); return; }
      const kind = button.dataset.slideObject;
      const [object] = normalizeObjects([{ kind, text: kind === "text" ? "Text box" : "" }]);
      objects.push(object);
      save();
      selectObject(objects.length - 1);
      button.closest("details").open = false;
      objectForm.elements.text.focus();
    });
  }
  $("slide-image-open").addEventListener("click", () => $("slide-image-file").click());
  $("slide-image-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > imageLimit) { status("Choose a PNG or JPEG under 550 KB."); return; }
    const slide = deck.slides[deck.active];
    if (slide.objects?.length >= 25) { status("A slide can contain up to 25 objects."); return; }
    try {
      const src = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => resolve(reader.result), { once: true });
        reader.addEventListener("error", () => reject(reader.error), { once: true });
        reader.readAsDataURL(file);
      });
      if (!imageData(src)) throw new Error("Choose a valid PNG or JPEG.");
      const image = new Image();
      image.src = src;
      await image.decode();
      if (slide !== deck.slides[deck.active]) { status("Select the same slide before adding the picture."); return; }
      const objects = slide.objects ??= [];
      if (objects.length >= 25) { status("A slide can contain up to 25 objects."); return; }
      const ratio = image.naturalWidth / image.naturalHeight;
      const width = Math.max(8, Math.min(38, 60 * ratio * 9 / 16));
      const height = Math.min(60, width * 16 / (9 * ratio));
      const [object] = normalizeObjects([{ kind: "image", src, width, height, x: 48, y: 29, text: "" }]);
      objects.push(object);
      save();
      selectObject(objects.length - 1);
      $("slide-image-open").closest("details").open = false;
      objectForm.elements.text.focus();
    } catch (error) { status(error.message || "The image could not be opened."); }
  });
  objectForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const objects = deck.slides[deck.active].objects;
    const changes = Object.fromEntries(["x", "y", "width", "height", "rotation"].map((key) => [key, objectForm.elements[key].valueAsNumber]));
    const { fill, text } = objectForm.elements;
    [objects[selectedObject]] = normalizeObjects([{ ...objects[selectedObject], ...changes, fill: fill.value.slice(1), text: text.value }]);
    save();
    renderObjects();
  });
  function rearrangeObject(front) {
    const slide = deck.slides[deck.active];
    const objects = slide.objects;
    const before = [...objects];
    const [object] = objects.splice(selectedObject, 1);
    if (front) objects.push(object);
    else objects.unshift(object);
    remapEffects(slide, before);
    save();
    selectObject(front ? objects.length - 1 : 0, true);
  }
  $("slide-object-front").addEventListener("click", () => rearrangeObject(true));
  $("slide-object-back").addEventListener("click", () => rearrangeObject(false));
  $("slide-object-duplicate").addEventListener("click", () => {
    const objects = deck.slides[deck.active].objects;
    const object = objects?.[selectedObject];
    if (!object || objects.length >= 25) return;
    const x = object.x + (object.x + object.width + 3 > 100 ? -3 : 3);
    const y = object.y + (object.y + object.height + 3 > 100 ? -3 : 3);
    const [copy] = normalizeObjects([{ ...object, x, y }]);
    objects.push(copy);
    save();
    selectObject(objects.length - 1, true);
  });
  $("slide-object-delete").addEventListener("click", () => {
    const slide = deck.slides[deck.active];
    const before = [...slide.objects];
    slide.objects.splice(selectedObject, 1);
    remapEffects(slide, before);
    save();
    selectObject(null);
    document.querySelector("[data-slide-object]").closest("details").querySelector("summary").focus();
  });
  $("slide-object-close").addEventListener("click", () => {
    const index = selectedObject;
    selectObject(null);
    objectLayer.children[index]?.focus();
  });

  function remapEffects(slide, before) {
    slide.animations = (slide.animations || []).flatMap((effect) => {
      if (!effect.target.startsWith("object:")) return [effect];
      const index = slide.objects.indexOf(before[Number(effect.target.slice(7))]);
      return index < 0 ? [] : [{ ...effect, target: "object:" + index }];
    });
  }
  function targetOptions(slide) {
    return [["both", "Title and text"], ["title", "Title"], ["content", "Text"],
      ...(slide.objects || []).map((object, index) => ["object:" + index, `${object.kind} ${index + 1}${object.text ? " · " + object.text.slice(0, 40) : ""}`])];
  }
  function activeEffects() { return deck.slides[deck.active].animations ??= []; }
  function openEffect(index) {
    editingEffect = index;
    const slide = deck.slides[deck.active];
    const animation = normalizeAnimation(activeEffects()[index]);
    animationForm.elements.target.replaceChildren(...targetOptions(slide).map(([value, name]) => new Option(name, value)));
    for (const [field, value] of Object.entries(animation)) animationForm.elements[field].value = value;
    if (!animationForm.elements.target.value) animationForm.elements.target.value = "both";
    animationDialog.showModal();
  }
  function renderEffectList() {
    const list = activeEffects();
    const names = new Map(targetOptions(deck.slides[deck.active]));
    $("slide-animation-add").disabled = list.length >= 16;
    animationList.replaceChildren(...list.map((effect, index) => {
      const li = document.createElement("li");
      const title = document.createElement("span");
      const label = [...animationForm.elements.effect.options].find((option) => option.value === effect.effect)?.textContent;
      title.textContent = `${label} · ${names.get(effect.target) || "Object"} · ${effect.start === "auto" ? "Auto" : "Manual"}`;
      const commands = document.createElement("div");
      commands.className = "slides-actions";
      function action(text, callback, disabled = false) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button button-outline";
        button.disabled = disabled;
        button.textContent = text;
        button.setAttribute("aria-label", `${text} effect ${index + 1}`);
        button.addEventListener("click", callback);
        commands.append(button);
      }
      function update(change, focus) {
        change();
        save();
        renderEffectList();
        (animationList.children[focus]?.querySelector("button") ?? $("slide-animation-add")).focus();
      }
      function swap(other) { [list[index], list[other]] = [list[other], list[index]]; }
      action("Edit", () => openEffect(index));
      action("Up", () => update(() => swap(index - 1), index - 1), index === 0);
      action("Down", () => update(() => swap(index + 1), index + 1), index === list.length - 1);
      action("Remove", () => update(() => list.splice(index, 1), index));
      li.append(title, commands);
      return li;
    }));
  }
  $("slide-animate").addEventListener("click", () => {
    selectObject(null);
    animationPanel.hidden = false;
    renderEffectList();
    if (!activeEffects().length) openEffect();
    else $("slide-animation-add").focus();
  });
  $("slide-animation-add").addEventListener("click", () => openEffect());
  $("slide-animation-close").addEventListener("click", () => {
    animationPanel.hidden = true;
    $("slide-animate").focus();
  });
  animationDialog.querySelector("[data-close]").addEventListener("click", () => animationDialog.close());
  animationDialog.querySelector("[data-preview]").addEventListener("click", () => {
    const preview = animationDialog.querySelector(".transition-preview div");
    const { effect, duration, delay } = animationForm.elements;
    preview.getAnimations().forEach((animation) => animation.cancel());
    if (animationForm.reportValidity() && !reducedMotion.matches && effects[effect.value]) {
      preview.animate(effects[effect.value], { duration: duration.valueAsNumber * 1000, delay: delay.valueAsNumber * 1000 });
    }
  });
  animationForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const { effect, target, start, duration, delay } = animationForm.elements;
    const config = normalizeAnimation({
      effect: effect.value, target: target.value, start: start.value,
      duration: duration.valueAsNumber, delay: delay.valueAsNumber,
    });
    const list = activeEffects();
    if (editingEffect !== undefined) {
      if (config.effect === "none") list.splice(editingEffect, 1);
      else list[editingEffect] = config;
    } else if (config.effect !== "none") list.push(config);
    save();
    renderEffectList();
    animationDialog.close();
  });

  function editedTransition() {
    const { effect, duration, advance } = transitionForm.elements;
    return normalizeTransition({
      effect: effect.value,
      duration: Math.round(duration.valueAsNumber * 1000),
      advance: Math.round(advance.valueAsNumber * 1000),
    });
  }
  function playTransition(node, config) {
    node.getAnimations().forEach((animation) => animation.cancel());
    if (!reducedMotion.matches && transitionFrames[config.effect]) {
      return node.animate(transitionFrames[config.effect], { duration: config.duration, easing: "ease-out" });
    }
  }
  $("slide-transition").addEventListener("click", () => {
    const { effect, duration, advance, all } = transitionForm.elements;
    const config = normalizeTransition(deck.slides[deck.active].transition);
    effect.value = config.effect;
    duration.value = config.duration / 1000;
    advance.value = config.advance / 1000;
    all.checked = false;
    transitionDialog.showModal();
  });
  transitionDialog.querySelector("[data-preview]").addEventListener("click", () => {
    if (transitionForm.reportValidity()) playTransition(transitionDialog.querySelector(".transition-preview div"), editedTransition());
  });
  transitionDialog.querySelector("[data-close]").addEventListener("click", () => transitionDialog.close());
  transitionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const config = editedTransition();
    const slides = transitionForm.elements.all.checked ? deck.slides : [deck.slides[deck.active]];
    for (const slide of slides) slide.transition = config;
    save();
    transitionDialog.close();
  });

  function stopAnimation() {
    for (const timer of effectTimers) window.clearTimeout(timer);
    effectTimers.clear();
    for (const animation of playing.values()) animation.cancel();
    playing.clear();
  }

  function animateEffect({ effect, target, duration, delay }) {
    if (effect === "none" || reducedMotion.matches) return;
    const targets = target === "both" ? [$("present-title"), $("present-content")] : target.startsWith("object:")
      ? [$("present-object-layer").children[Number(target.slice(7))]] : [$("present-" + target)];
    for (const element of targets.filter((element) => element && (element.textContent || element.children.length || target.startsWith("object:")))) {
      playing.get(element)?.cancel();
      const frames = element.style.transform
        ? effects[effect].map((frame) => frame.transform ? { ...frame, transform: element.style.transform + " " + frame.transform } : frame)
        : effects[effect];
      playing.set(element, element.animate(frames, { duration: duration * 1000, delay: delay * 1000, easing: "ease-in-out", fill: "both" }));
    }
  }
  function currentEffects(trigger) {
    return (deck.slides[presentedSlide].animations ?? []).filter((effect) => effect.start === trigger);
  }
  function automaticEffects() {
    let elapsed = 0;
    for (const config of currentEffects("auto")) {
      if (!elapsed) animateEffect(config);
      else {
        const timer = window.setTimeout(() => { effectTimers.delete(timer); animateEffect(config); }, elapsed);
        effectTimers.add(timer);
      }
      elapsed += (config.delay + config.duration) * 1000;
    }
  }
  function playAnimation() {
    const queue = currentEffects("manual");
    if (!queue.length) { stopAnimation(); automaticEffects(); return; }
    if (manualEffect === queue.length) { stopAnimation(); manualEffect = 0; }
    animateEffect(queue[manualEffect++]);
    $("present-play").textContent = manualEffect === queue.length ? "Replay effects" : "Play next effect";
  }

  function renderPresentation() {
    stopAnimation();
    manualEffect = 0;
    window.clearTimeout(advanceTimer);
    transitioning?.cancel();
    const slide = deck.slides[presentedSlide];
    $("present-title").textContent = slide.title;
    $("present-content").textContent = slide.content;
    drawObjects($("present-object-layer"), slide.objects);
    $("present-notes").textContent = slide.notes || "";
    $("present-notes-toggle").hidden = !slide.notes;
    setPresenterNotes(false);
    applyTheme($("present-title").closest(".slides-paper"), slide.theme);
    $("present-count").textContent = `${presentedSlide + 1} / ${deck.slides.length}`;
    $("present-prev").disabled = visibleSlide(presentedSlide - 1, -1) < 0;
    $("present-next").disabled = visibleSlide(presentedSlide + 1, 1) < 0;
    const config = normalizeTransition(slide.transition);
    transitioning = playTransition($("present-title").closest(".slides-paper"), config);
    if (config.advance && !$("present-next").disabled) {
      advanceTimer = window.setTimeout(() => $("present-next").click(), config.advance);
    }
    const manual = currentEffects("manual");
    $("present-play").hidden = !slide.animations?.length || reducedMotion.matches;
    $("present-play").textContent = manual.length ? "Play effect" : "Replay effects";
    if (!reducedMotion.matches) automaticEffects();
  }
  function visibleSlide(index, direction) {
    for (let candidate = index; candidate >= 0 && candidate < deck.slides.length; candidate += direction) {
      if (!deck.slides[candidate].hidden) return candidate;
    }
    return -1;
  }
  const presentFrom = (index) => {
    const next = visibleSlide(index, 1);
    presentedSlide = next < 0 ? visibleSlide(index, -1) : next;
    if (presentedSlide < 0) return;
    slideShow.showModal();
    renderPresentation();
  };
  $("present-play").addEventListener("click", playAnimation);
  function setPresenterNotes(open) {
    $("present-notes").hidden = !open;
    $("present-notes-toggle").setAttribute("aria-expanded", String(open));
    $("present-notes-toggle").textContent = open ? "Hide speaker notes" : "Show speaker notes";
  }
  $("present-notes-toggle").addEventListener("click", () => setPresenterNotes($("present-notes").hidden));
  slideShow.addEventListener("close", () => {
    stopAnimation();
    window.clearTimeout(advanceTimer);
    transitioning?.cancel();
  });
  reducedMotion.addEventListener("change", () => { if (slideShow.open) renderPresentation(); });
  $("slide-present").addEventListener("click", () => presentFrom(deck.active));
  $("slide-present-start").addEventListener("click", () => presentFrom(0));
  $("present-close").addEventListener("click", () => slideShow.close());
  $("present-prev").addEventListener("click", () => { presentedSlide = visibleSlide(presentedSlide - 1, -1); renderPresentation(); });
  $("present-next").addEventListener("click", () => { presentedSlide = visibleSlide(presentedSlide + 1, 1); renderPresentation(); });
  slideShow.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") $("present-prev").click();
    if (event.key === "ArrowRight") $("present-next").click();
  });

  $("slide-import").addEventListener("click", () => $("slide-file").click());
  $("slide-save-deck").addEventListener("click", save);
  $("slide-new-deck").addEventListener("click", () => {
    const hasContent = deck.name !== "Untitled presentation" || deck.slides.length > 1 ||
      deck.slides.some((slide) => slide.title || slide.content || slide.notes || slide.objects?.length);
    if (hasContent && !window.confirm("Start a new presentation? Download a PowerPoint copy first if you want to keep this one.")) return;
    deck = newDeck();
    save();
    render();
    $("deck-title").focus();
  });
  function buildPrintDeck() {
    $("slide-print-layout").replaceChildren(...deck.slides.filter((slide) => !slide.hidden).map((slide) => {
      const paper = document.createElement("section");
      paper.className = "slides-paper";
      const heading = document.createElement("h2");
      heading.textContent = slide.title;
      const text = document.createElement("div");
      text.className = "slide-print-content";
      text.textContent = slide.content;
      const objects = document.createElement("div");
      objects.className = "slide-object-layer";
      drawObjects(objects, slide.objects);
      applyTheme(paper, slide.theme);
      paper.append(heading, text, objects);
      return paper;
    }));
  }
  window.addEventListener("beforeprint", buildPrintDeck);
  $("slide-print-deck").addEventListener("click", () => window.print());
  $("slide-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { status("Choose a PPTX file under 8 MB."); return; }
    try {
      const slides = window.AdigunPresentation.importTextSlides(new Uint8Array(await file.arrayBuffer()));
      const empty = deck.slides.length === 1 && !deck.slides[0].title && !deck.slides[0].content && !deck.slides[0].notes && !deck.slides[0].objects?.length;
      const existing = empty ? [] : deck.slides;
      if (existing.length + slides.length > maxSlides) { status("This import would exceed the 40-slide limit."); return; }
      deck = { name: empty ? file.name.replace(/\.pptx$/i, "").slice(0, 100) : deck.name, active: existing.length, slides: [...existing, ...slides] };
      save();
      render();
      status("Slide text, supported pictures and speaker notes imported. Advanced formatting may differ.");
    } catch (error) {
      status(error.message || "This PowerPoint file could not be opened.");
    }
  });

  $("slide-export").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const slides = deck.slides.map((slide) => ({ title: slide.title, lines: slide.content.split("\n"), theme: slide.theme, hidden: slide.hidden, notes: slide.notes, transition: slide.transition, objects: slide.objects, animations: slide.animations }));
      const blob = await window.AdigunPresentation.createBlob(slides);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const filename = deck.name.trim().replace(/[\\/:*?"<>|]/g, "-") || "Untitled presentation";
      link.download = filename + ".pptx";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const browserOnly = slides.some((slide) => slide.animations?.some(({ effect }) => !["fade", "exit", "rise"].includes(effect)));
      status(browserOnly ? "PowerPoint exported. Pulse and Drift play in the browser only." : "PowerPoint exported");
    } catch {
      status("The PowerPoint file could not be exported.");
    } finally { button.disabled = false; }
  });
  render();
})();
