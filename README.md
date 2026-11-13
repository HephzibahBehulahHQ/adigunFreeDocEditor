# adigunFreeDocEditor

Browser based document workspace for the Hephzibah Behulah product family. The current foundation provides a responsive editor, browser-local saving, DOCX/TXT/Markdown/HTML import, PDF viewing, and local HTML/Word export.

## Run locally

Serve the repository root with any static HTTP server. For example:

```powershell
python -m http.server 4173
```

Open `http://localhost:4173`. The application has no build step. The DOCX converter is vendored locally; the app does not load it from a CDN.

## Current support

- Start from six on-device templates for meeting notes, project briefs, formal letters, status reports, research notes, and resumes, or create a blank document. Template content opens in the editable workspace and stays in this browser.
- Create and edit text with headings, emphasis, lists, alignment, links, tables, local PNG/JPEG/GIF images (up to 8 MB each) and browser spellcheck.
- Export editable documents as `.docx`, preserving supported headings, basic text emphasis, hyperlinks, lists, tables with horizontal and vertical cell spans, PNG/JPEG/GIF images, page size, orientation, preset margins and custom per-side margins. Tracked insertions and deletions export as native OOXML revisions with author/date. Anchored review comments export as native Word comments with author/date/resolved state; advanced Word styling is not preserved.
- Convert local DOCX, TXT, Markdown and HTML files to HTML or DOCX with a sandboxed preview and explicit compatibility warnings. Markdown and HTML source formatting is flattened; PDF remains view-only.
- Import `.docx` as editable semantic content, including supported headings, lists, tables and safe inline raster images. Anchored Word comments load into Review when selected text can be matched; unmatched comments are reported. Supported A4/US Letter page size and orientation, preset margins, and custom per-side margins up to 100 mm import when all sections agree. Default section header/footer text and PAGE fields import into Layout; gutters, custom page sizes, mixed setup, first/even-page variants, advanced Word fields and advanced styling may be lost with a warning. Simple paragraph-level tracked insertions and deletions are reviewable when converted text aligns exactly; unaligned or unsupported revisions may be lost. Mammoth converts Word structure to HTML; full Word pagination and styling fidelity are not preserved.
- Save and reopen editable documents in this browser's IndexedDB. Autosave can be switched off; Ctrl+S remains available.
- Set default paper size, orientation and margins for newly created documents in Settings.
- New and migrated documents are stored as versioned, allow-listed JSON trees; HTML and Word export serialize from that model.
- Import TXT, Markdown and HTML as editable text.
- View a PDF using the browser's PDF viewer and download the original PDF.
- Export the current editable document as HTML.
- Build a local extractive overview from sentences in the open document. It does not call or imitate an AI model.

PDF editing, conversion pipelines, cloud accounts, sharing and hosted AI are not implemented in this slice and are not presented as available features.

## Product references

- [Brand integration record](docs/BRAND_INTEGRATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Feature matrix](docs/FEATURE_MATRIX.md)
- [Security and privacy](docs/SECURITY_AND_PRIVACY.md)
- [Master product development prompt](adigunFreeDocEditor%20%E2%80%94%20Master%20Product%20Development%20Prompt.md)

