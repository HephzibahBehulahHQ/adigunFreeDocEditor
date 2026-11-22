(() => {
  function xmlText(value) {
    return Array.from(String(value || "")).filter((character) => {
      const code = character.codePointAt(0);
      return code === 9 || code === 10 || code === 13 || code >= 32;
    }).join("").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  const themes = Object.freeze({ paper: Object.freeze({ background: "FFFFFF", text: "182035" }), violet: Object.freeze({ background: "EEE7FC", text: "30204B" }), midnight: Object.freeze({ background: "17213A", text: "F3F5F9" }) });
  const transitionFrames = {
    fade: [{ opacity: 0 }, { opacity: 1 }],
    push: [{ transform: "translateX(14%)", opacity: 0.45 }, { transform: "translateX(0)", opacity: 1 }],
  };
  const powerpoint2010 = "http://schemas.microsoft.com/office/powerpoint/2010/main";
  const markupCompatibility = "http://schemas.openxmlformats.org/markup-compatibility/2006";
  const slideWidth = 12192000;
  const slideHeight = 6858000;
  const objectKinds = ["text", "rectangle", "ellipse", "image"];
  const imagePattern = /^data:image\/(png|jpeg);base64,([a-z0-9+/]+={0,2})$/i;
  const imageLimit = 550 * 1024;
  function imageData(source) {
    if (typeof source !== "string" || source.length > Math.ceil(imageLimit * 4 / 3) + 32) return null;
    const match = imagePattern.exec(source);
    if (!match) return null;
    try {
      const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
      const png = match[1].toLowerCase() === "png";
      const valid = png ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => byte === bytes[index]) :
        bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      return valid && bytes.length <= imageLimit ? { bytes, extension: png ? "png" : "jpg" } : null;
    } catch { return null; }
  }

  function objectDimension(value, minimum, maximum, fallback) {
    return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.round(value * 10) / 10)) : fallback;
  }
  function normalizeObjects(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((object) => objectKinds.includes(object?.kind) &&
      (object.kind !== "image" || typeof object.src === "string" && imagePattern.test(object.src) && object.src.length <= Math.ceil(imageLimit * 4 / 3) + 32)).slice(0, 25).map((object) => {
      const width = objectDimension(object.width, 8, 100, 28);
      const height = objectDimension(object.height, 8, 100, 18);
      const normalized = {
        kind: object.kind,
        x: objectDimension(object.x, 0, 100 - width, Math.min(12, 100 - width)),
        y: objectDimension(object.y, 0, 100 - height, Math.min(65, 100 - height)),
        width,
        height,
        rotation: objectDimension(object.rotation, -180, 180, 0),
        text: typeof object.text === "string" ? object.text.slice(0, 500) : "",
        fill: object.kind !== "text" && /^[a-f0-9]{6}$/i.test(object.fill ?? "") ? object.fill.toUpperCase() : "D9D1FC",
      };
      if (object.kind === "image") normalized.src = object.src;
      if (Number.isInteger(object.group) && object.group >= 1 && object.group <= 25) normalized.group = object.group;
      return normalized;
    });
  }
  function groupXml(members, id) {
    const left = Math.min(...members.map(({ object }) => object.x));
    const top = Math.min(...members.map(({ object }) => object.y));
    const right = Math.max(...members.map(({ object }) => object.x + object.width));
    const bottom = Math.max(...members.map(({ object }) => object.y + object.height));
    const origin = `x="${Math.round(slideWidth * left / 100)}" y="${Math.round(slideHeight * top / 100)}"`;
    const extent = `cx="${Math.round(slideWidth * (right - left) / 100)}" cy="${Math.round(slideHeight * (bottom - top) / 100)}"`;
    return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="Adigun group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off ${origin}/><a:ext ${extent}/><a:chOff ${origin}/><a:chExt ${extent}/></a:xfrm></p:grpSpPr>
      ${members.map(({ markup }) => markup).join("")}</p:grpSp>`;
  }
  function objectTransform(object) {
    const unitX = (value) => Math.round(slideWidth * value / 100);
    const unitY = (value) => Math.round(slideHeight * value / 100);
    return `<a:xfrm rot="${Math.round(object.rotation * 60000)}"><a:off x="${unitX(object.x)}" y="${unitY(object.y)}"/><a:ext cx="${unitX(object.width)}" cy="${unitY(object.height)}"/></a:xfrm>`;
  }
  function objectXml(object, index, theme) {
    const kind = object.kind === "ellipse" ? "ellipse" : "rect";
    const fill = object.kind === "text" ? "<a:noFill/>" : `<a:solidFill><a:srgbClr val="${object.fill}"/></a:solidFill>`;
    const textColor = object.kind === "text" ? (themes[theme] || themes.paper).text : themes.paper.text;
    const text = object.text.split(/\r?\n/).map((line) =>
      `<a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="1400"><a:solidFill><a:srgbClr val="${textColor}"/></a:solidFill></a:rPr><a:t xml:space="preserve">${xmlText(line)}</a:t></a:r></a:p>`).join("");
    return `<p:sp><p:nvSpPr><p:cNvPr id="${index + 4}" name="Adigun ${object.kind} ${index + 1}"/><p:cNvSpPr${object.kind === "text" ? ' txBox="1"' : ""}/><p:nvPr/></p:nvSpPr>
      <p:spPr>${objectTransform(object)}
      <a:prstGeom prst="${kind}"><a:avLst/></a:prstGeom>${fill}<a:ln><a:noFill/></a:ln></p:spPr>
      <p:txBody><a:bodyPr anchor="ctr" wrap="square"/><a:lstStyle/>${text}</p:txBody></p:sp>`;
  }

  function imageXml(object, index, relationshipId) {
    const description = xmlText(object.text).replace(/"/g, "&quot;");
    return `<p:pic><p:nvPicPr><p:cNvPr id="${index + 4}" name="Adigun image ${index + 1}" descr="${description}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${objectTransform(object)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  }

  function normalizeTransition(value) {
    return {
      effect: Object.hasOwn(transitionFrames, value?.effect) ? value.effect : "none",
      duration: Number.isInteger(value?.duration) && value.duration >= 100 && value.duration <= 5000 ? value.duration : 600,
      advance: Number.isInteger(value?.advance) && value.advance >= 100 && value.advance <= 120000 ? value.advance : 0,
    };
  }

  function transitionXml(value) {
    const { effect, duration, advance } = normalizeTransition(value);
    if (effect === "none" && !advance) return "";
    const speed = duration < 500 ? "fast" : duration > 900 ? "slow" : "med";
    const options = ` spd="${speed}" advClick="1"${advance ? ` advTm="${advance}"` : ""}`;
    const effectXml = effect === "fade" ? "<p:fade/>" : effect === "push" ? '<p:push dir="l"/>' : "";
    const element = (extra = "") => `<p:transition${options}${extra}>${effectXml}</p:transition>`;
    if (effect === "none") return element();
    return `<mc:AlternateContent xmlns:mc="${markupCompatibility}" xmlns:p14="${powerpoint2010}"><mc:Choice Requires="p14">${element(` p14:dur="${duration}"`)}</mc:Choice><mc:Fallback>${element()}</mc:Fallback></mc:AlternateContent>`;
  }

  function animationTimingXml(animations, objects) {
    const effects = (Array.isArray(animations) ? animations : []).slice(0, 16).flatMap((animation) => {
      if (!["fade", "exit", "rise"].includes(animation?.effect)) return [];
      const { effect, target, start, duration, delay } = animation;
      const match = /^object:(\d{1,2})$/.exec(target ?? "");
      const shapeIds = match ? (+match[1] < objects.length ? [+match[1] + 4] : []) :
        ({ title: [2], content: [3], both: [2, 3] })[target];
      if (!Array.isArray(shapeIds) || !shapeIds.length) return [];
      const milliseconds = (value, min, max, fallback) =>
        Math.round((Number.isFinite(value) && value >= min && value <= max ? value : fallback) * 1000);
      return [{ effect, shapeIds, start, duration: milliseconds(duration, 0.1, 5, 0.6), delay: milliseconds(delay, 0, 10, 0) }];
    });
    if (!effects.length) return "";
    let id = 2;
    const condition = (delay) => `<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>`;
    const parallel = (attributes, delay, markup) =>
      `<p:par><p:cTn id="${++id}" fill="hold" ${attributes}>${condition(delay)}<p:childTnLst>${markup}</p:childTnLst></p:cTn></p:par>`;
    const target = (shapeId) => `<p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl>`;
    function effectNode(effect, shapeId, start, delay) {
      const enter = effect.effect !== "exit";
      const visibility = `<p:set><p:cBhvr><p:cTn id="${++id}" dur="1" fill="hold">${condition(enter ? 0 : effect.duration)}</p:cTn>${target(shapeId)}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${enter ? "visible" : "hidden"}"/></p:to></p:set>`;
      const rise = effect.effect === "rise";
      const fade = () => `<p:animEffect transition="${enter ? "in" : "out"}" filter="fade"><p:cBhvr><p:cTn id="${++id}" dur="${effect.duration}"/>${target(shapeId)}</p:cBhvr></p:animEffect>`;
      // Positions are slide-relative. Start with the top of the object at the bottom edge.
      const motion = () => `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${++id}" dur="${effect.duration}" fill="hold"/>${target(shapeId)}<p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="1+#ppt_h/2"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_y"/></p:val></p:tav></p:tavLst></p:anim>`;
      const animation = rise ? motion() : fade();
      return parallel(`presetID="${rise ? 2 : 10}" presetClass="${enter ? "entr" : "exit"}" presetSubtype="${rise ? 4 : 0}" grpId="0" nodeType="${start}"`, delay, visibility + animation);
    }
    let elapsed = 0;
    const automatic = effects.filter(({ start }) => start !== "manual").map((effect) => {
      const delay = elapsed + effect.delay;
      elapsed += effect.delay + effect.duration;
      return parallel("", delay, effect.shapeIds.map((shapeId) => effectNode(effect, shapeId, "withEffect", 0)).join(""));
    }).join("");
    const manual = effects.filter(({ start }) => start === "manual").map((effect) =>
      parallel("", "indefinite", parallel("", effect.delay,
        effect.shapeIds.map((shapeId, index) => effectNode(effect, shapeId, index ? "withEffect" : "clickEffect", 0)).join(""),
      )),
    ).join("");
    const navigation = (direction) =>
      `<p:${direction}CondLst><p:cond evt="on${direction === "prev" ? "Prev" : "Next"}" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:${direction}CondLst>`;
    return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${automatic ? parallel("", 0, automatic) : ""}${manual}</p:childTnLst></p:cTn>${navigation("prev")}${navigation("next")}</p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
  }

  function readAnimations(slide, shapeTargets) {
    const child = (node, name) => [...(node?.children ?? [])].find((part) => part.localName === name);
    const branches = (node) => [...(child(node, "childTnLst")?.children ?? [])].map((part) => child(part, "cTn")).filter(Boolean);
    const delay = (node) => child(child(node, "stCondLst"), "cond")?.getAttribute("delay");
    const timing = slide.getElementsByTagNameNS("*", "timing")[0];
    const main = [...(timing?.getElementsByTagNameNS("*", "cTn") ?? [])].find((node) => node.getAttribute("nodeType") === "mainSeq");
    const result = [];
    function readStep(step, start, startDelay) {
      const effects = branches(step).flatMap((node) => {
        const items = child(node, "childTnLst");
        const fade = child(items, "animEffect");
        const motion = child(items, "anim");
        const rise = node.getAttribute("presetID") === "2" && node.getAttribute("presetClass") === "entr" &&
          node.getAttribute("presetSubtype") === "4" && motion;
        if (!rise && fade?.getAttribute("filter") !== "fade") return [];
        const behavior = child(rise ? motion : fade, "cBhvr");
        const target = shapeTargets.get(child(child(behavior, "tgtEl"), "spTgt")?.getAttribute("spid"));
        const duration = Number(child(behavior, "cTn")?.getAttribute("dur")) / 1000;
        if (!target || duration < 0.1 || duration > 5 || !Number.isFinite(duration)) return [];
        const effect = rise ? "rise" : fade.getAttribute("transition") === "out" ? "exit" : "fade";
        return [{ effect, target, start, duration, delay: startDelay }];
      });
      if (effects.length === 2 && effects[0].target === "title" && effects[1].target === "content" &&
          effects[0].effect === effects[1].effect && effects[0].duration === effects[1].duration) {
        result.push({ ...effects[0], target: "both" });
      } else result.push(...effects);
      return Math.max(0, ...effects.map((effect) => effect.duration));
    }
    for (const wrapper of branches(main)) {
      if (delay(wrapper) === "indefinite") {
        for (const step of branches(wrapper)) readStep(step, "manual", Number(delay(step) ?? 0) / 1000);
      } else if (delay(wrapper) === "0") {
        let elapsed = 0;
        for (const step of branches(wrapper)) {
          const offset = Number(delay(step) ?? 0) / 1000;
          elapsed = offset + readStep(step, "auto", Math.max(0, Math.round((offset - elapsed) * 1000) / 1000));
        }
      }
    }
    return result.slice(0, 16);
  }

  function createParts(slides) {
    if (slides.length > 80) throw new Error("PowerPoint output is limited to 80 slides.");
    const pns = "http://schemas.openxmlformats.org/presentationml/2006/main";
    const ans = "http://schemas.openxmlformats.org/drawingml/2006/main";
    const rns = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const slideXml = ({ title: slideTitle, lines, theme }) => {
      const palette = Object.hasOwn(themes, theme) ? themes[theme] : themes.paper;
      const textFill = '<a:solidFill><a:srgbClr val="' + palette.text + '"/></a:solidFill>';
      const background = '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="' + palette.background + '"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>';
      const title = xmlText(slideTitle);
      const paragraphs = (lines.length ? lines : [""]).map((line) => "<a:p><a:pPr algn=\"l\"/><a:r><a:rPr lang=\"en-US\" sz=\"1800\">" + textFill + "</a:rPr><a:t xml:space=\"preserve\">" + xmlText(line) + "</a:t></a:r></a:p>").join("");
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="' + ans + '" xmlns:r="' + rns + '" xmlns:p="' + pns + '"><p:cSld>' + background + '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="800000" y="350000"/><a:ext cx="10500000" cy="900000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800" b="1">' + textFill + '</a:rPr><a:t xml:space="preserve">' + title + '</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="900000" y="1450000"/><a:ext cx="10300000" cy="5000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>' + paragraphs + '</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
    };
    const files = Object.create(null);
    files["_rels/.rels"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>';
    files["ppt/presentation.xml"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="' + ans + '" xmlns:r="' + rns + '" xmlns:p="' + pns + '"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId' + (slides.length + 1) + '"/></p:sldMasterIdLst><p:sldIdLst>' + slides.map((_, i) => '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 1) + '"/>').join("") + '</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/></p:presentation>';
    files["ppt/_rels/presentation.xml.rels"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + slides.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + (i + 1) + '.xml"/>').join("") + '<Relationship Id="rId' + (slides.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/></Relationships>';
    files["ppt/slideMasters/slideMaster1.xml"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="' + ans + '" xmlns:r="' + rns + '" xmlns:p="' + pns + '"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" hlink="hlink" tx1="dk1" tx2="dk2" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>';
    files["ppt/_rels/slideMasters/slideMaster1.xml.rels"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>';
    files["ppt/slideLayouts/slideLayout1.xml"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="' + ans + '" xmlns:r="' + rns + '" xmlns:p="' + pns + '" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
    files["ppt/_rels/slideLayouts/slideLayout1.xml.rels"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>';
    files["ppt/theme/theme1.xml"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="' + ans + '" name="Adigun"><a:themeElements><a:clrScheme name="Adigun"><a:dk1><a:srgbClr val="17233A"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="26334D"/></a:dk2><a:lt2><a:srgbClr val="F4F6FA"/></a:lt2><a:accent1><a:srgbClr val="4F6BED"/></a:accent1><a:accent2><a:srgbClr val="697386"/></a:accent2><a:accent3><a:srgbClr val="6B8E23"/></a:accent3><a:accent4><a:srgbClr val="C0504D"/></a:accent4><a:accent5><a:srgbClr val="8064A2"/></a:accent5><a:accent6><a:srgbClr val="4BACC6"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Adigun"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme><a:fmtScheme name="Adigun"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';
    const media = new Set();
    for (let i = 0; i < slides.length; i++) {
      const pictureLinks = [];
      const entries = normalizeObjects(slides[i].objects).map((object, index) => ({
        object, markup: serializeObject(object, index),
      }));
      function serializeObject(object, index) {
        if (object.kind !== "image") return objectXml(object, index, slides[i].theme);
        const image = imageData(object.src);
        if (!image) throw new Error("A slide image is damaged or unsupported.");
        const id = "rIdImage" + (index + 1);
        const name = `slide${i + 1}-image${index + 1}.${image.extension}`;
        media.add(image.extension);
        files["ppt/media/" + name] = image.bytes;
        pictureLinks.push(`<Relationship Id="${id}" Type="${rns}/image" Target="../media/${name}"/>`);
        return imageXml(object, index, id);
      }
      const groups = new Map();
      for (const entry of entries) {
        if (!entry.object.group) continue;
        const members = groups.get(entry.object.group) ?? [];
        members.push(entry);
        groups.set(entry.object.group, members);
      }
      const objects = entries.map((entry) => {
        const members = groups.get(entry.object.group);
        if (!members || members.length < 2) return entry.markup;
        return members.at(-1) === entry ? groupXml(members, 29 + entry.object.group) : "";
      }).join("");
      const timing = animationTimingXml(slides[i].animations, entries);
      const markup = slideXml(slides[i]).replace("</p:spTree>", objects + "</p:spTree>")
        .replace("</p:sld>", transitionXml(slides[i].transition) + timing + "</p:sld>");
      files["ppt/slides/slide" + (i + 1) + ".xml"] = slides[i].hidden ? markup.replace("<p:sld ", '<p:sld show="0" ') : markup;
      files["ppt/slides/_rels/slide" + (i + 1) + ".xml.rels"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>';
      const path = "ppt/slides/_rels/slide" + (i + 1) + ".xml.rels";
      files[path] = files[path].replace("</Relationships>", pictureLinks.join("") + "</Relationships>");
    }
    const overrides = [
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
      ...slides.map((_, i) => '<Override PartName="/ppt/slides/slide' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'),
    ];
    const notes = slides.map((slide, index) => [slide.notes, index + 1]).filter(([text]) => typeof text === "string" && text.trim());
    if (notes.length) {
      const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
      const ns = `xmlns:p="${pns}" xmlns:a="${ans}" xmlns:r="${rns}"`;
      const relationship = (id, type, target) => `<Relationship Id="${id}" Type="${rns}/${type}" Target="${target}"/>`;
      const relationships = (...values) => head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + values.join("") + "</Relationships>";
      const part = (path, type) => overrides.push(`<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.${type}+xml"/>`);
      const group = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>';
      const notesShape = (paragraphs, master = false) => '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>' +
        (master ? '<p:spPr><a:xfrm><a:off x="550000" y="4400000"/><a:ext cx="5700000" cy="3800000"/></a:xfrm></p:spPr>' : '<p:spPr/>') +
        '<p:txBody><a:bodyPr/><a:lstStyle/>' + paragraphs + '</p:txBody></p:sp>';
      files["ppt/presentation.xml"] = files["ppt/presentation.xml"]
        .replace("<p:sldIdLst>", '<p:notesMasterIdLst><p:notesMasterId r:id="rIdNotes"/></p:notesMasterIdLst><p:sldIdLst>')
        .replace("</p:presentation>", '<p:notesSz cx="6858000" cy="9144000"/></p:presentation>');
      files["ppt/_rels/presentation.xml.rels"] = files["ppt/_rels/presentation.xml.rels"].replace("</Relationships>",
        relationship("rIdNotes", "notesMaster", "notesMasters/notesMaster1.xml") + "</Relationships>");
      const colorMap = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';
      files["ppt/notesMasters/notesMaster1.xml"] = head + `<p:notesMaster ${ns}><p:cSld><p:spTree>${group}${notesShape("<a:p/>", true)}</p:spTree></p:cSld>${colorMap}</p:notesMaster>`;
      files["ppt/notesMasters/_rels/notesMaster1.xml.rels"] = relationships(relationship("rId1", "theme", "../theme/theme1.xml"));
      part("ppt/notesMasters/notesMaster1.xml", "notesMaster");
      for (const [text, number] of notes) {
        const paragraphs = text.split(/\r?\n/).map((line) => `<a:p><a:r><a:t xml:space="preserve">${xmlText(line)}</a:t></a:r></a:p>`).join("");
        const path = `ppt/notesSlides/notesSlide${number}.xml`;
        files[path] = head + `<p:notes ${ns}><p:cSld><p:spTree>${group}${notesShape(paragraphs)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
        files[`ppt/notesSlides/_rels/notesSlide${number}.xml.rels`] = relationships(
          relationship("rId1", "notesMaster", "../notesMasters/notesMaster1.xml"),
          relationship("rId2", "slide", `../slides/slide${number}.xml`));
        const slideRels = `ppt/slides/_rels/slide${number}.xml.rels`;
        files[slideRels] = files[slideRels].replace("</Relationships>", relationship("rIdNotes", "notesSlide", `../notesSlides/notesSlide${number}.xml`) + "</Relationships>");
        part(path, "notesSlide");
      }
    }
    files["[Content_Types].xml"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' + overrides.join("") + '</Types>';
    const mediaTypes = [...media].map((extension) => `<Default Extension="${extension}" ContentType="image/${extension === "jpg" ? "jpeg" : extension}"/>`).join("");
    files["[Content_Types].xml"] = files["[Content_Types].xml"].replace("<Override", mediaTypes + "<Override");
    return Object.fromEntries(Object.entries(files).map(([name, value]) => [name, typeof value === "string" ? window.fflate.strToU8(value) : value]));
  }

  function createBlob(slides) {
    return new Promise((resolve, reject) => {
      if (typeof window.fflate?.zip !== "function") return reject(new Error("The local PowerPoint package tool did not load."));
      window.fflate.zip(createParts(slides), { level: 6 }, (error, bytes) => error ? reject(error) : resolve(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" })));
    });
  }

  function importTextSlides(bytes, Parser = DOMParser) {
    const officeNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    let total = 0;
    const parts = window.fflate.unzipSync(bytes, {
      filter({ name, originalSize }) {
        if (!/^ppt\/(?:presentation\.xml|_rels\/presentation\.xml\.rels|slides\/(?:[\w.-]+\.xml|_rels\/[\w.-]+\.xml\.rels)|notesSlides\/[\w.-]+\.xml|media\/[\w.-]+\.(?:png|jpe?g))$/i.test(name)) return false;
        if (name.startsWith("ppt/media/") && originalSize > imageLimit) return false;
        total += originalSize;
        if (total > 12 * 1024 * 1024) throw new Error("PowerPoint text parts are too large.");
        return true;
      },
    });
    const parse = (name) => {
      if (!Object.hasOwn(parts, name)) throw new Error("A PowerPoint part is missing.");
      const source = window.fflate.strFromU8(parts[name]);
      if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("Unsupported PowerPoint XML.");
      const document = new Parser().parseFromString(source, "application/xml");
      if (document.getElementsByTagName("parsererror").length) throw new Error("A PowerPoint part is invalid.");
      return document;
    };
    const relationships = new Map([...parse("ppt/_rels/presentation.xml.rels").getElementsByTagNameNS("*", "Relationship")]
      .filter((part) => part.getAttribute("Type")?.endsWith("/slide") && part.getAttribute("TargetMode") !== "External")
      .map((part) => [part.getAttribute("Id"), part.getAttribute("Target")]));
    const presentation = parse("ppt/presentation.xml");
    const definitions = [...presentation.getElementsByTagNameNS("*", "sldId")];
    const dimensions = presentation.getElementsByTagNameNS("*", "sldSz")[0];
    const inputWidth = Math.max(1, Number(dimensions?.getAttribute("cx")) || slideWidth);
    const inputHeight = Math.max(1, Number(dimensions?.getAttribute("cy")) || slideHeight);
    const paragraphs = (shape) => [...shape.getElementsByTagNameNS("*", "p")].map((paragraph) =>
      [...paragraph.getElementsByTagNameNS("*", "t")].map((run) => run.textContent).join("")).join("\n");
    function readObjectTransform(shape) {
      const transform = shape.getElementsByTagNameNS("*", "xfrm")[0];
      const origin = transform?.getElementsByTagNameNS("*", "off")[0];
      const extent = transform?.getElementsByTagNameNS("*", "ext")[0];
      return {
        x: Number(origin?.getAttribute("x")) * 100 / inputWidth,
        y: Number(origin?.getAttribute("y")) * 100 / inputHeight,
        width: Number(extent?.getAttribute("cx")) * 100 / inputWidth,
        height: Number(extent?.getAttribute("cy")) * 100 / inputHeight,
        rotation: Number(transform?.getAttribute("rot")) / 60000,
      };
    }
    function authoredObject(shape, name) {
      const match = /^Adigun (text|rectangle|ellipse) \d+$/.exec(name ?? "");
      if (!match) return null;
      return {
        ...readObjectTransform(shape),
        kind: match[1],
        fill: shape.getElementsByTagNameNS("*", "srgbClr")[0]?.getAttribute("val"),
        text: paragraphs(shape),
      };
    }
    function pictures(slide, path) {
      const relationPath = path.replace("slides/", "slides/_rels/") + ".rels";
      if (!Object.hasOwn(parts, relationPath)) return new Map();
      const images = new Map([...parse(relationPath).getElementsByTagNameNS("*", "Relationship")].filter((part) =>
        part.getAttribute("Type")?.endsWith("/image") && part.getAttribute("TargetMode") !== "External").map((part) =>
        [part.getAttribute("Id"), part.getAttribute("Target")]));
      return new Map([...slide.getElementsByTagNameNS("*", "pic")].flatMap((picture) => {
        const id = picture.getElementsByTagNameNS("*", "blip")[0]?.getAttributeNS(officeNs, "embed");
        const match = /^(?:\.\.\/|\/ppt\/)media\/([\w.-]+\.(png|jpe?g))$/i.exec(images.get(id) ?? "");
        const bytes = match && parts["ppt/media/" + match[1]];
        if (!bytes) return [];
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 4096) binary += String.fromCharCode(...bytes.subarray(offset, offset + 4096));
        const media = match[2].toLowerCase() === "png" ? "png" : "jpeg";
        const src = `data:image/${media};base64,${btoa(binary)}`;
        if (!imageData(src)) return [];
        return [[picture, { ...readObjectTransform(picture), kind: "image", src,
          text: picture.getElementsByTagNameNS("*", "cNvPr")[0]?.getAttribute("descr") || "" }]];
      }));
    }
    function slideNotes(path) {
      const relationshipPath = path.replace("slides/", "slides/_rels/") + ".rels";
      if (!Object.hasOwn(parts, relationshipPath)) return "";
      const relationship = [...parse(relationshipPath).getElementsByTagNameNS("*", "Relationship")].find((part) =>
        part.getAttribute("Type")?.endsWith("/notesSlide") && part.getAttribute("TargetMode") !== "External");
      const target = relationship?.getAttribute("Target") ?? "";
      const notesPath = target.replace(/^(?:\.\.\/notesSlides\/|\/ppt\/notesSlides\/)/, "ppt/notesSlides/");
      if (!/^ppt\/notesSlides\/[\w.-]+\.xml$/.test(notesPath) || !Object.hasOwn(parts, notesPath)) return "";
      return [...parse(notesPath).getElementsByTagNameNS("*", "sp")].filter((shape) =>
        shape.getElementsByTagNameNS("*", "ph")[0]?.getAttribute("type") === "body").map(paragraphs).join("\n");
    }
    if (!definitions.length || definitions.length > 40) throw new Error("Open a presentation with 1–40 slides.");
    return definitions.map((definition) => {
      const id = definition.getAttributeNS(officeNs, "id") ||
        [...definition.attributes].find((attribute) => attribute.namespaceURI && attribute.localName === "id")?.value;
      const target = relationships.get(id) || "";
      const path = target.startsWith("/") ? target.slice(1) : "ppt/" + target;
      if (!/^ppt\/slides\/[\w.-]+\.xml$/.test(path)) throw new Error("Unsupported PowerPoint slide location.");
      const slide = parse(path);
      const objects = [];
      const images = pictures(slide, path);
      const groups = new Map();
      const shapeTargets = new Map();
      function restoreObject(shape, object) {
        const group = shape.parentElement;
        if (group?.localName === "grpSp" &&
            group.parentElement?.localName === "spTree" &&
            group.getElementsByTagNameNS("*", "cNvPr")[0]?.getAttribute("name") === "Adigun group") {
          const transform = group.getElementsByTagNameNS("*", "xfrm")[0];
          const part = (name, attr) => Number(transform?.getElementsByTagNameNS("*", name)[0]?.getAttribute(attr));
          if (!Number(transform?.getAttribute("rot")) && !["1", "true"].includes(transform?.getAttribute("flipH")) &&
              !["1", "true"].includes(transform?.getAttribute("flipV")) &&
              part("ext", "cx") === part("chExt", "cx") && part("ext", "cy") === part("chExt", "cy")) {
            if (!groups.has(group)) groups.set(group, groups.size + 1);
            object.group = groups.get(group);
            object.x += (part("off", "x") - part("chOff", "x")) * 100 / inputWidth;
            object.y += (part("off", "y") - part("chOff", "y")) * 100 / inputHeight;
          }
        }
        if (objects.length < 25) shapeTargets.set(shape.getElementsByTagNameNS("*", "cNvPr")[0]?.getAttribute("id"), "object:" + objects.length);
        objects.push(object);
      }
      const shapes = [...slide.getElementsByTagName("*")].flatMap((shape) => {
        if (shape.localName === "pic") {
          const picture = images.get(shape);
          if (picture) restoreObject(shape, picture);
          return [];
        }
        if (shape.localName !== "sp") return [];
        const placeholder = shape.getElementsByTagNameNS("*", "ph")[0]?.getAttribute("type");
        const name = shape.getElementsByTagNameNS("*", "cNvPr")[0]?.getAttribute("name");
        const object = authoredObject(shape, name);
        if (object) {
          restoreObject(shape, object);
          return [];
        }
        return [{ text: paragraphs(shape), id: shape.getElementsByTagNameNS("*", "cNvPr")[0]?.getAttribute("id"),
          isTitle: ["title", "ctrTitle"].includes(placeholder) || name === "Title", isContent: name === "Content" }];
      });
      const titleIndex = shapes.findIndex((shape) => shape.isTitle);
      const title = titleIndex < 0 ? "" : shapes[titleIndex].text;
      const content = shapes.filter((shape, index) => index !== titleIndex && shape.text).map((shape) => shape.text).join("\n");
      if (title.length > 120 || content.length > 1500) throw new Error("A slide exceeds the title or body text limit.");
      const result = { title, content };
      if (titleIndex >= 0) shapeTargets.set(shapes[titleIndex].id, "title");
      const contentShape = shapes.find((shape) => shape.isContent && !shape.isTitle);
      if (contentShape) shapeTargets.set(contentShape.id, "content");
      const animations = readAnimations(slide, shapeTargets);
      if (animations.length) result.animations = animations;
      if (objects.length) result.objects = normalizeObjects(objects);
      const notes = slideNotes(path);
      if (notes.length > 4000) throw new Error("A slide exceeds the 4,000-character notes limit.");
      if (notes) result.notes = notes;
      if (["0", "false"].includes(slide.documentElement.getAttribute("show"))) result.hidden = true;
      const transition = slide.getElementsByTagNameNS(slide.documentElement.namespaceURI, "transition")[0];
      if (transition) {
        const effect = [...transition.children].find((node) => Object.hasOwn(transitionFrames, node.localName))?.localName;
        const speed = transition.getAttribute("spd");
        result.transition = normalizeTransition({
          effect,
          duration: Number(transition.getAttributeNS(powerpoint2010, "dur")) || ({ fast: 300, slow: 1200 }[speed] || 600),
          advance: Number(transition.getAttribute("advTm")),
        });
      }
      return result;
    });
  }

  window.AdigunPresentation = { createParts, createBlob, importTextSlides, themes, normalizeTransition, transitionFrames, normalizeObjects, imageLimit, imageData };
})();
