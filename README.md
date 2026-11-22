# adigunFreeDocEditor

Browser based document workspace for the Hephzibah Behulah product family. The current foundation provides a responsive editor, browser-local saving, DOCX/TXT/Markdown/HTML import, PDF viewing, and local HTML/Word export.

## Interface direction

Use the supplied WPS Office home and editor screenshots as workflow references for a visually distinct Adigun workspace.

- **Home.** Put document search and real New document, Open file, and Templates actions above a recent-documents list. Show saved names and modification times. Keep document navigation and available file tools within reach.
- **Editor.** Put open document tabs, quick actions, and a compact ribbon above the writing area. Group text, paragraph, layout, and review controls so users can find them by task.
- **Canvas.** Center the paper on a neutral background. Keep the outline, indent ruler, and Adigun tools available on demand, with the document taking priority.
- **Verification.** Check Home, document search, opening a recent file, editing, and returning to Home at desktop and mobile widths. Confirm the deployed commit on the public site before marking the interface work complete.

## Run locally

Serve the repository root with any static HTTP server. For example:

```powershell
python -m http.server 4173
```

Build the bundled editor runtime and start the local server:

```powershell
npm ci
npm run build:editor
npm run build:pdf
npm run build:ocr
python scripts/assemble_pdfjs.py
python -m http.server 4173
```

Open `http://localhost:4173`. The DOCX converter is vendored locally; the app does not load it from a CDN.

## Current support

- **AI drafts** previews document and slide drafts and downloads text or editable PowerPoint files after review. It requires a private relay and an explicitly approved prompt.

- Open **PDF** to navigate pages and bookmarks, search and select PDF text, add page markup, and arrange or extract pages. Fill supported AcroForm fields, place text or a visible typed signature, and save a new copy. OCR produces editable English text. Permanent redaction produces a separate flattened, image-only PDF. Signed files and XFA forms require a compatible external application.

- Open **Slides** to edit thumbnails, titles, speaker notes, text boxes, basic shapes, and supported PNG or JPEG pictures. Hide, reorder, and duplicate slides. Native PPTX round-trips cover supported slide objects, notes, and transitions. Object animations play in the browser slideshow. Print visible slides to save a PDF.

- Open **Sheets** to work with up to 12 sheets, 9,999 rows and 26 columns per sheet. The grid renders the rows near the viewport. Edit ranges, apply styles and validation, calculate cross-sheet references, sort and filter records, freeze headers, refresh PivotTables, and build range-backed bar charts. Supported styles, validation, conditional rules, charts and print settings round-trip through XLSX. Preview CSV columns before importing. CSV exports contain calculated values from one sheet. PivotTable results export as cells.

- Start from six on-device templates for meeting notes, project briefs, formal letters, status reports, research notes, and resumes, or create a blank document. Template content opens in the editable workspace and stays in this browser.
- Create and edit text with headings, emphasis, lists, alignment, links, tables, local PNG/JPEG/GIF images (up to 8 MB each) and browser spellcheck.
- Export editable documents as `.docx`, preserving supported headings, basic text emphasis, hyperlinks, lists, tables with horizontal and vertical cell spans, PNG/JPEG/GIF images, page size, orientation, preset margins and custom per-side margins. Tracked insertions and deletions export as native OOXML revisions with author/date. Anchored review comments export as native Word comments with author/date/resolved state; advanced Word styling is not preserved.
- Convert local DOCX, TXT, Markdown and HTML files to HTML or DOCX with a sandboxed preview and explicit compatibility warnings. Markdown and HTML source formatting is flattened; PDF remains view-only.
- Import `.docx` as editable semantic content, including supported headings, lists, tables and safe inline raster images. Anchored Word comments load into Review when selected text can be matched; unmatched comments are reported. Supported A4/US Letter page size and orientation, preset margins, and custom per-side margins up to 100 mm import when all sections agree. Default section header/footer text and PAGE fields import into Layout; gutters, custom page sizes, mixed setup, first/even-page variants, advanced Word fields and advanced styling may be lost with a warning. Simple paragraph-level tracked insertions and deletions are reviewable when converted text aligns exactly; unaligned or unsupported revisions may be lost. Mammoth converts Word structure to HTML; full Word pagination and styling fidelity are not preserved.
- Save and reopen editable documents in this browser's IndexedDB. Autosave can be switched off; Ctrl+S remains available.
- Set default paper size, orientation and margins for newly created documents in Settings.
- New and migrated documents are stored as versioned, allow-listed JSON trees; HTML and Word export serialize from that model.
- Import TXT, Markdown and HTML as editable text.
- Insert or refresh a contents list from document headings, edit native Word footnotes, and use the document-only print preview to save a PDF.
- View a PDF using the browser's PDF viewer and download the original PDF.
- Export the current editable document as HTML.
- Build a local extractive overview from sentences in the open document. It does not call or imitate an AI model.

Browser-local saving keeps editable Docs, Sheets and Slides on the device. Download PDF copies and exported office files to retain them outside the current workspace. Format support varies by operation.

## Configure the private AI relay

Set the following environment variables before running `npm run start:ai` on your computer. The relay binds to loopback and serves `http://127.0.0.1:8787/draft` by default.

- `ADIGUN_AI_UPSTREAM` is the full chat-completions endpoint for your configured model provider.
- `ADIGUN_AI_MODEL` is the provider’s model identifier.
- `ADIGUN_AI_PROVIDER_KEY` is the provider credential if required. Keep it in the relay environment.
- `ADIGUN_AI_ACCESS_TOKEN` is a separate relay token of at least 20 characters. Enter this token in the browser.
- `ADIGUN_AI_ORIGIN` is the allowed app origin. It defaults to the production site. Set it to your local server origin for local testing.

GitHub Pages serves the browser interface. Start and configure the private relay separately. Open documents and slides are sent only if their text is included in a prompt you approve and submit.

## Product references

- [Brand integration record](docs/BRAND_INTEGRATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Feature matrix](docs/FEATURE_MATRIX.md)
- [Security and privacy](docs/SECURITY_AND_PRIVACY.md)
- [Master product development prompt](adigunFreeDocEditor%20%E2%80%94%20Master%20Product%20Development%20Prompt.md)

