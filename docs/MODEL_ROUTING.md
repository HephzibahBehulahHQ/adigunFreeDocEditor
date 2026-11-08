# Architecture Overview

## Product goal

`adigunFreeDocEditor` is a browser-first document workspace built for real document creation, editing, and export without depending on a fake demonstration layer.

## Architectural boundaries

- Application shell and navigation
- Document editor surface
- Local document persistence
- Import and export flows
- Adigun document assistant
- Accessibility and responsive layout

## Current implementation status

This foundation release uses React + Vite + TypeScript in the browser. It stores documents in browser localStorage so the editor can create, reopen, and retain recent drafts without a backend.

### Document flow

1. User selects Create blank document or imports a file.
2. The document is stored in a persisted list under localStorage.
3. The content is edited in a `contenteditable` surface.
4. Formatting commands are applied with native browser document commands.
5. The user can export the result as DOCX or Markdown.

### AI / assistance flow

This release intentionally uses local document assistance instead of external AI because no server-side model connection or credentials are configured. The assistant summarises, rewrites, and performs a lightweight translation pass on selected text using transparent in-browser logic.

## Known limits

- DOCX import is text-based and is best suited for ordinary Word files without complex layout structures.
- Browser `contenteditable` is not a complete fidelity Word engine and does not claim perfect Microsoft Word compatibility.
- PDF editing and conversion are intentionally not claimed in this foundation release.

## Future phases

The next product stages would add stronger DOCX fidelity, PDF viewing, true conversion pipelines, and a server-side AI layer behind explicit user consent.
