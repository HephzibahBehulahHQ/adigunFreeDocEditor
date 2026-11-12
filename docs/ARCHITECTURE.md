# Architecture

The repository initially contained the product specification, mockup, custom-domain file and policy note, with no application source or dependency manifest. The first deployable foundation is therefore buildless HTML, CSS and JavaScript served from the GitHub Pages root.

## Runtime boundaries

- `index.html` defines the accessible application shell, workspace, entry screen, editor surface, and Adigun panel.
- `styles.css` defines responsive layout and maps the verified HB brand tokens.
- `app.js` owns document state, toolbar actions, browser-local persistence, file import/export and the local extractive overview.
- `document-model.js` normalizes editable content to a versioned JSON tree with an allow-list for nodes and attributes, including small font-family, text-color and highlight-color palettes. IndexedDB stores this model; older HTML records are migrated on open, and HTML/DOCX exports serialize through the model.
- The editor groups top-level blocks into paper-sized sheets, renders visual page previews, provides page navigation, and supports fit-to-width zoom. New-document page defaults are stored in local preferences and applied to blank documents and imports that lack page setup. Explicit page breaks persist; oversized blocks expand beyond a sheet, and paragraphs are not split across pages.
- The built-in Word exporter packages a documented subset of the editable HTML as OOXML in an uncompressed ZIP container; it preserves supported font families, text colors and Word highlight values, basic tables, header rows, column spans and embedded PNG/JPEG/GIF files, and confirms before exporting content it cannot retain. It uses no external runtime service and does not claim full Word fidelity.
- DOCX import uses the locally vendored Mammoth 1.12.2 browser build, checks ZIP structure and expanded-size limits, then copies only allow-listed HTML elements and safe links/embedded raster images into the editor.
- `assets/hb-official.jpg` is the unmodified corporate artwork from the shared design system.
- IndexedDB stores editable document records in this browser. PDF files remain in memory while open and are not copied into the document store.
- Review comments are local document sidecar metadata with text quotes and surrounding context for re-anchoring; they are not exported as DOCX comments. Tracked insertions, deletions and revision history remain unsupported.
- Inserted PNG, JPEG and GIF images are verified by file signature, limited to 8 MB and stored as embedded data URLs in the local editable document.

The schema-backed model now governs persistence and exports. Interactive editing still uses the browser's `contenteditable` surface; replacing it with a transaction-based document engine remains Phase 2 work. The editor canvas scrolls continuously and does not automatically paginate. Users can insert explicit page breaks; these persist in the document model and export as OOXML page breaks. The outline panel lists each explicit break and navigates to the start of its following section. This is break-point navigation, not automatic pagination or page thumbnails. Page size, orientation and margin presets are stored per document and applied to the editor canvas and DOCX section properties. The canvas uses the selected paper dimensions as its minimum height and grows with longer content in the continuous editor. This is not paginated print preview.

The editor currently supports a bounded set of browser editing commands. This is not a DOCX document model or an OOXML parser. Before DOCX compatibility, complex revisions, or conversion work, replace or wrap the editing surface with a structured document engine and verify round-trip behavior against representative files.

The Adigun panel has no provider adapter. Its current overview is a deterministic extractive operation over local text, explicitly labelled as such; no document content leaves the browser.

