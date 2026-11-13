# Architecture

The repository initially contained the product specification, mockup, custom-domain file and policy note, with no application source or dependency manifest. The first deployable foundation is therefore buildless HTML, CSS and JavaScript served from the GitHub Pages root.

## Runtime boundaries

- `index.html` defines the accessible application shell, workspace, entry screen, editor surface, and Adigun panel. On wide screens, the open local tools panel occupies a dedicated, pointer- and keyboard-resizable right rail; narrower screens retain the floating panel layout.
- `styles.css` defines responsive layout and maps the verified HB brand tokens.
- `app.js` owns document state, toolbar actions, browser-local persistence, file import/export and the local extractive overview.
- `document-model.js` normalizes editable content to a versioned JSON tree with an allow-list for nodes and attributes, including font-family, text-color, highlight-color, line-spacing, paragraph-spacing and indent-level allow-lists. IndexedDB stores this model; older HTML records are migrated on open, and HTML/DOCX exports serialize through the model.
- The editor groups top-level blocks into paper-sized sheets, renders visual page previews, provides page navigation, and supports fit-to-width zoom. New-document page defaults are stored in local preferences and applied to blank documents and imports that lack page setup. Explicit page breaks persist; oversized blocks expand beyond a sheet, and paragraphs are not split across pages.
- The built-in Word exporter packages a documented subset of the editable HTML as OOXML in an uncompressed ZIP container; it preserves supported font families, text colors, Word highlight values, paragraph/line spacing and indentation, basic tables, header rows, column spans and embedded PNG/JPEG/GIF files, and confirms before exporting content it cannot retain. It uses no external runtime service and does not claim full Word fidelity.
- DOCX import uses the locally vendored Mammoth 1.12.2 browser build, checks ZIP structure and expanded-size limits, copies only allow-listed HTML elements and safe links/embedded raster images into the editor, and reads supported A4/US Letter page size, orientation, preset or custom margins (up to 100 mm per side), and default header/footer text and PAGE fields from consistent section properties. Gutter, mixed, or unsupported section setup falls back to new-document defaults with a warning.
- `assets/hb-official.jpg` is the unmodified corporate artwork from the shared design system.
- IndexedDB stores editable document records in this browser. Open-document tabs are session-local; switching editable tabs flushes the current document first. PDF tabs retain their File objects in memory while open, are not copied into the document store, and are not restored after reload.
- Review comments are local document sidecar metadata with text quotes and surrounding context for re-anchoring. DOCX import maps comment ranges to editable text when the anchor can be matched; native Word comments export with author, date, and resolved status. Conversion reports when source comments are not retained. Local tracked insertions and deletions persist and export as OOXML revisions; formatting and multi-paragraph edits are outside the supported tracking scope.
- Inserted PNG, JPEG and GIF images are verified by file signature, limited to 8 MB and stored as embedded data URLs in the local editable document.

The schema-backed model now governs persistence and exports. Interactive editing still uses the browser's `contenteditable` surface; replacing it with a transaction-based document engine remains Phase 2 work. The editor automatically groups rendered top-level blocks into paper-sized sheets; a block stays intact and can extend beyond a sheet when it is too tall. The page navigation panel renders thumbnails and scrolls to the selected sheet. Explicit page breaks persist in the document model and export as OOXML page breaks. Page size, orientation, preset margins, and custom per-side margins (stored in millimeters) persist with each document and map to DOCX section properties. Custom margins are limited to 100 mm per side and must leave at least 10 mm of content area; imports with gutters, custom paper sizes, mixed section settings, or out-of-range margins fall back with a warning. This is an approximate editor layout, not Word's pagination engine.

The editor currently supports a bounded set of browser editing commands. This is not a DOCX document model or an OOXML parser. Before DOCX compatibility, complex revisions, or conversion work, replace or wrap the editing surface with a structured document engine and verify round-trip behavior against representative files.

The Adigun panel has no provider adapter. Its current overview is a deterministic extractive operation over local text, explicitly labelled as such; no document content leaves the browser.


