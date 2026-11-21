(() => {
  function xmlText(value) {
    return Array.from(String(value || "")).filter((character) => {
      const code = character.codePointAt(0);
      return code === 9 || code === 10 || code === 13 || code >= 32;
    }).join("").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function createParts(slides) {
    if (slides.length > 80) throw new Error("PowerPoint output is limited to 80 slides.");
    const pns = "http://schemas.openxmlformats.org/presentationml/2006/main";
    const ans = "http://schemas.openxmlformats.org/drawingml/2006/main";
    const rns = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const slideXml = ({ title: slideTitle, lines }) => {
      const title = xmlText(slideTitle);
      const paragraphs = (lines.length ? lines : [""]).map((line) => "<a:p><a:pPr algn=\"l\"/><a:r><a:rPr lang=\"en-US\" sz=\"1800\"/><a:t xml:space=\"preserve\">" + xmlText(line) + "</a:t></a:r></a:p>").join("");
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="' + ans + '" xmlns:r="' + rns + '" xmlns:p="' + pns + '"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="800000" y="350000"/><a:ext cx="10500000" cy="900000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800" b="1"/><a:t xml:space="preserve">' + title + '</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="900000" y="1450000"/><a:ext cx="10300000" cy="5000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>' + paragraphs + '</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
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
    for (let i = 0; i < slides.length; i++) {
      files["ppt/slides/slide" + (i + 1) + ".xml"] = slideXml(slides[i]);
      files["ppt/slides/_rels/slide" + (i + 1) + ".xml.rels"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>';
    }
    const overrides = [
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
      ...slides.map((_, i) => '<Override PartName="/ppt/slides/slide' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'),
    ];
    files["[Content_Types].xml"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' + overrides.join("") + '</Types>';
    return Object.fromEntries(Object.entries(files).map(([name, value]) => [name, window.fflate.strToU8(value)]));
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
        if (!/^ppt\/(?:presentation\.xml|_rels\/presentation\.xml\.rels|slides\/[\w.-]+\.xml)$/.test(name)) return false;
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
    const definitions = [...parse("ppt/presentation.xml").getElementsByTagNameNS("*", "sldId")];
    if (!definitions.length || definitions.length > 40) throw new Error("Open a presentation with 1–40 slides.");
    return definitions.map((definition) => {
      const id = definition.getAttributeNS(officeNs, "id") ||
        [...definition.attributes].find((attribute) => attribute.namespaceURI && attribute.localName === "id")?.value;
      const target = relationships.get(id) || "";
      const path = target.startsWith("/") ? target.slice(1) : "ppt/" + target;
      if (!/^ppt\/slides\/[\w.-]+\.xml$/.test(path)) throw new Error("Unsupported PowerPoint slide location.");
      const shapes = [...parse(path).getElementsByTagNameNS("*", "sp")].map((shape) => {
        const paragraphs = [...shape.getElementsByTagNameNS("*", "p")].map((paragraph) =>
          [...paragraph.getElementsByTagNameNS("*", "t")].map((run) => run.textContent).join(""));
        const placeholder = shape.getElementsByTagNameNS("*", "ph")[0]?.getAttribute("type");
        const name = shape.getElementsByTagNameNS("*", "cNvPr")[0]?.getAttribute("name");
        return { text: paragraphs.join("\n"), isTitle: ["title", "ctrTitle"].includes(placeholder) || name === "Title" };
      });
      const titleIndex = shapes.findIndex((shape) => shape.isTitle);
      const title = titleIndex < 0 ? "" : shapes[titleIndex].text;
      const content = shapes.filter((shape, index) => index !== titleIndex && shape.text).map((shape) => shape.text).join("\n");
      if (title.length > 120 || content.length > 1500) throw new Error("A slide exceeds the title or body text limit.");
      return { title, content };
    });
  }

  window.AdigunPresentation = { createParts, createBlob, importTextSlides };
})();
