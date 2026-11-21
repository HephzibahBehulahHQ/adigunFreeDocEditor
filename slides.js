(() => {
  const $ = (id) => document.getElementById(id);
  const storageKey = "adigun-slides-v1";
  const maxSlides = 40;
  const blank = () => ({ title: "", content: "" });
  const slideShow = $("slide-show");
  let deck = { name: "Untitled presentation", active: 0, slides: [blank()] };
  let presentedSlide = 0;

  function status(message) { $("slides-save").textContent = message; }
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(stored?.slides) && stored.slides.length) {
      const slides = stored.slides.slice(0, maxSlides).map((slide) => ({
        title: typeof slide?.title === "string" ? slide.title.slice(0, 120) : "",
        content: typeof slide?.content === "string" ? slide.content.slice(0, 1500) : "",
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
      button.textContent = (index + 1) + ". " + (slide.title.trim() || "Untitled slide");
      button.setAttribute("aria-pressed", String(index === deck.active));
      button.addEventListener("click", () => {
        deck.active = index;
        save();
        render();
        $("slide-list").children[index].firstElementChild.focus();
      });
      item.append(button);
      return item;
    }));
  }

  function render() {
    const slide = deck.slides[deck.active];
    $("deck-title").value = deck.name;
    $("slide-title").value = slide.title;
    $("slide-content").value = slide.content;
    $("slide-add").disabled = deck.slides.length >= maxSlides;
    $("slide-duplicate").disabled = deck.slides.length >= maxSlides;
    $("slide-remove").disabled = deck.slides.length === 1;
    $("slide-earlier").disabled = deck.active === 0;
    $("slide-later").disabled = deck.active === deck.slides.length - 1;
    renderList();
  }

  function addSlide(slide) {
    deck.slides.splice(++deck.active, 0, slide);
    save();
    render();
    $("slide-title").focus();
  }

  function moveSlide(delta) {
    const oldIndex = deck.active;
    const nextIndex = oldIndex + delta;
    const [slide] = deck.slides.splice(oldIndex, 1);
    deck.slides.splice(nextIndex, 0, slide);
    deck.active = nextIndex;
    save();
    render();
    $("slide-list").children[nextIndex].firstElementChild.focus();
  }

  $("deck-title").addEventListener("input", (event) => { deck.name = event.target.value; save(); });
  $("slide-title").addEventListener("input", (event) => { deck.slides[deck.active].title = event.target.value; save(); renderList(); });
  $("slide-content").addEventListener("input", (event) => { deck.slides[deck.active].content = event.target.value; save(); });
  $("slide-add").addEventListener("click", () => addSlide(blank()));
  $("slide-duplicate").addEventListener("click", () => addSlide({ ...deck.slides[deck.active] }));
  $("slide-earlier").addEventListener("click", () => moveSlide(-1));
  $("slide-later").addEventListener("click", () => moveSlide(1));
  $("slide-remove").addEventListener("click", () => {
    if (!window.confirm("Delete this slide from the presentation?")) return;
    deck.slides.splice(deck.active, 1);
    deck.active = Math.min(deck.active, deck.slides.length - 1);
    save();
    render();
    $("slide-title").focus();
  });

  function renderPresentation() {
    const slide = deck.slides[presentedSlide];
    $("present-title").textContent = slide.title;
    $("present-content").textContent = slide.content;
    $("present-count").textContent = `${presentedSlide + 1} / ${deck.slides.length}`;
    $("present-prev").disabled = presentedSlide === 0;
    $("present-next").disabled = presentedSlide >= deck.slides.length - 1;
  }
  $("slide-present").addEventListener("click", () => { presentedSlide = deck.active; renderPresentation(); slideShow.showModal(); });
  $("present-close").addEventListener("click", () => slideShow.close());
  $("present-prev").addEventListener("click", () => { presentedSlide--; renderPresentation(); });
  $("present-next").addEventListener("click", () => { presentedSlide++; renderPresentation(); });
  slideShow.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") $("present-prev").click();
    if (event.key === "ArrowRight") $("present-next").click();
  });

  $("slide-import").addEventListener("click", () => $("slide-file").click());
  $("slide-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { status("Choose a PPTX file under 8 MB."); return; }
    try {
      const slides = window.AdigunPresentation.importTextSlides(new Uint8Array(await file.arrayBuffer()));
      const empty = deck.slides.length === 1 && !deck.slides[0].title && !deck.slides[0].content;
      const existing = empty ? [] : deck.slides;
      if (existing.length + slides.length > maxSlides) { status("This import would exceed the 40-slide limit."); return; }
      deck = { name: empty ? file.name.replace(/\.pptx$/i, "").slice(0, 100) : deck.name, active: existing.length, slides: [...existing, ...slides] };
      save();
      render();
      status("Slide text imported. Images and original formatting are not included.");
    } catch (error) {
      status(error.message || "This PowerPoint file could not be opened.");
    }
  });

  $("slide-export").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const slides = deck.slides.map((slide) => ({ title: slide.title, lines: slide.content.split("\n") }));
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
