# adigunFreeDocEditor

Browser based document workspace for the Hephzibah Behulah product family. The current first slice provides an entry screen, a basic editable document workspace, browser-local saving, text/HTML import, PDF viewing, and HTML export.

## Run locally

Serve the repository root with any static HTTP server. For example:

```powershell
python -m http.server 4173
```

Open `http://localhost:4173`. The application has no build step or third party runtime dependencies in this slice.

## Current support

- Create and edit basic text with headings, emphasis, lists, alignment, links and browser spellcheck.
- Export editable documents as `.docx`, preserving supported headings, basic text emphasis, hyperlinks, lists, page size and orientation. This is a bounded first Word export; tables, images, revisions and advanced Word styling are not preserved.
- Save and reopen editable documents in this browser's IndexedDB. Autosave can be switched off; Ctrl+S remains available.
- Import TXT, Markdown and HTML as editable text.
- View a PDF using the browser's PDF viewer and download the original PDF.
- Export the current editable document as HTML.
- Build a local extractive overview from sentences in the open document. It does not call or imitate an AI model.

DOCX import, PDF editing, conversion pipelines, cloud accounts, sharing and hosted AI are not implemented in this slice and are not presented as available features.

## Product references

- [Brand integration record](docs/BRAND_INTEGRATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Feature matrix](docs/FEATURE_MATRIX.md)
- [Security and privacy](docs/SECURITY_AND_PRIVACY.md)
- [Master product development prompt](adigunFreeDocEditor%20%E2%80%94%20Master%20Product%20Development%20Prompt.md)
