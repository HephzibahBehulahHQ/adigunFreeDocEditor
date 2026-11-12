# Architecture

The repository initially contained the product specification, mockup, custom-domain file and policy note, with no application source or dependency manifest. The first deployable foundation is therefore buildless HTML, CSS and JavaScript served from the GitHub Pages root.

## Runtime boundaries

- `index.html` defines the accessible application shell, workspace, entry screen, editor surface, and Adigun panel.
- `styles.css` defines responsive layout and maps the verified HB brand tokens.
- `app.js` owns document state, toolbar actions, browser-local persistence, file import/export and the local extractive overview.
- `assets/hb-official.jpg` is the unmodified corporate artwork from the shared design system.
- IndexedDB stores editable document records in this browser. PDF files remain in memory while open and are not copied into the document store.

The editor currently supports a bounded set of browser editing commands. This is not a DOCX document model or an OOXML parser. Before DOCX compatibility, complex revisions, or conversion work, replace or wrap the editing surface with a structured document engine and verify round-trip behavior against representative files.

The Adigun panel has no provider adapter. Its current overview is a deterministic extractive operation over local text, explicitly labelled as such; no document content leaves the browser.
