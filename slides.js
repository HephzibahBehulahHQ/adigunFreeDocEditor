(() => {
  const $ = (id) => document.getElementById(id);
  const storageKey = "adigun-slides-v1";
  const maxSlides = 40;
  const blank = () => ({ title: "", content: "" });
  const newDeck = () => ({ name: "Untitled presentation", active: 0, slides: [blank()] });
  const slideShow = $("slide-show");
  const animationDialog = $("slide-animation-dialog");
  const animationForm = animationDialog.querySelector("form");
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
  let playing = [];
  let transitioning;
  let advanceTimer;
  let deck = newDeck();
  let presentedSlide = 0;
  let draggedSlide = null;
  let selectedObject = null;

  function normalizeAnimation(animation) {
    const { effect, target, start, duration, delay } = animation || {};
    return {
      effect: Object.hasOwn(effects, effect) ? effect : "none",
      target: ["title", "content"].includes(target) ? target : "both",
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
        animation: normalizeAnimation(slide?.animation),
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
        node.setAttribute("aria-pressed", String(index === selectedObject));
        node.addEventListener("click", () => selectObject(index, true));
        node.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) return;
          const bounds = layer.getBoundingClientRect();
          const { clientX, clientY } = event;
          let move = object;
          node.setPointerCapture(event.pointerId);
          const pointerMove = (position) => {
            [move] = normalizeObjects([{
              ...object,
              x: object.x + (position.clientX - clientX) * 100 / bounds.width,
              y: object.y + (position.clientY - clientY) * 100 / bounds.height,
            }]);
            placeObject(node, move);
          };
          const finish = (position) => {
            node.removeEventListener("pointermove", pointerMove);
            node.removeEventListener("pointerup", finish);
            node.removeEventListener("pointercancel", finish);
            if (position.type === "pointerup" && move !== object) {
              objects[index] = move;
              save();
              selectObject(index, true);
            } else placeObject(node, object);
          };
          node.addEventListener("pointermove", pointerMove);
          node.addEventListener("pointerup", finish);
          node.addEventListener("pointercancel", finish);
        });
      }
      return node;
    }));
  }

  function renderObjects() {
    const objects = deck.slides[deck.active].objects ?? [];
    const object = objects[selectedObject];
    objectPanel.hidden = !object;
    drawObjects(objectLayer, objects, true);
    if (!object) return;
    for (const key of ["text", "x", "y", "width", "height", "rotation"]) objectForm.elements[key].value = object[key];
    objectForm.elements.fill.value = "#" + object.fill;
    objectForm.elements.fill.disabled = ["text", "image"].includes(object.kind);
    $("slide-object-text-label").textContent = object.kind === "image" ? "Alternative text" : "Text";
    $("slide-object-front").disabled = selectedObject === objects.length - 1;
    $("slide-object-back").disabled = selectedObject === 0;
  }

  function selectObject(index, focus = false) {
    selectedObject = index;
    renderObjects();
    if (focus) objectLayer.children[index]?.focus();
  }

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
    const objects = deck.slides[deck.active].objects;
    const [object] = objects.splice(selectedObject, 1);
    if (front) objects.push(object);
    else objects.unshift(object);
    save();
    selectObject(front ? objects.length - 1 : 0, true);
  }
  $("slide-object-front").addEventListener("click", () => rearrangeObject(true));
  $("slide-object-back").addEventListener("click", () => rearrangeObject(false));
  $("slide-object-delete").addEventListener("click", () => {
    deck.slides[deck.active].objects.splice(selectedObject, 1);
    save();
    selectObject(null);
    document.querySelector("[data-slide-object]").closest("details").querySelector("summary").focus();
  });
  $("slide-object-close").addEventListener("click", () => {
    const index = selectedObject;
    selectObject(null);
    objectLayer.children[index]?.focus();
  });

  $("slide-animate").addEventListener("click", () => {
    const animation = normalizeAnimation(deck.slides[deck.active].animation);
    for (const [field, value] of Object.entries(animation)) animationForm.elements[field].value = value;
    animationDialog.showModal();
  });
  animationDialog.querySelector("[data-close]").addEventListener("click", () => animationDialog.close());
  animationForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const { effect, target, start, duration, delay } = animationForm.elements;
    deck.slides[deck.active].animation = normalizeAnimation({
      effect: effect.value, target: target.value, start: start.value,
      duration: duration.valueAsNumber, delay: delay.valueAsNumber,
    });
    save();
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
    for (const animation of playing) animation.cancel();
    playing = [];
  }

  function playAnimation() {
    stopAnimation();
    const { effect, target, duration, delay } = normalizeAnimation(deck.slides[presentedSlide].animation);
    if (effect === "none" || reducedMotion.matches) return;
    const targets = target === "both" ? [$("present-title"), $("present-content")] : [$("present-" + target)];
    playing = targets.filter((element) => element.textContent).map((element) => element.animate(effects[effect], {
      duration: duration * 1000,
      delay: delay * 1000,
      easing: "ease-in-out",
      fill: "both",
    }));
  }

  function renderPresentation() {
    stopAnimation();
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
    const { effect, start } = normalizeAnimation(slide.animation);
    $("present-play").hidden = effect === "none" || reducedMotion.matches;
    if (start === "auto") playAnimation();
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
      const slides = deck.slides.map((slide) => ({ title: slide.title, lines: slide.content.split("\n"), theme: slide.theme, hidden: slide.hidden, notes: slide.notes, transition: slide.transition, objects: slide.objects }));
      const blob = await window.AdigunPresentation.createBlob(slides);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const filename = deck.name.trim().replace(/[\\/:*?"<>|]/g, "-") || "Untitled presentation";
      link.download = filename + ".pptx";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status("PowerPoint exported");
    } catch {
      status("The PowerPoint file could not be exported.");
    } finally { button.disabled = false; }
  });
  render();
})();
