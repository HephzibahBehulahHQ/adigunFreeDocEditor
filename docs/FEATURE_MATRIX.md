# Feature matrix

Status is specific to the current first workspace slice.

| Feature | Current status | Evidence / limit |
|---|---|---|
| Responsive workspace shell and entry screen | Implemented | `index.html` and responsive rules in `styles.css`. |
| Page setup controls | Partial | A4/US Letter, portrait/landscape and Normal/Narrow/Wide margins apply to the editing canvas, persist per document and map to DOCX section properties. Users can insert explicit page breaks, persisted in the document model and exported as OOXML breaks. The outline panel lists and navigates to those explicit break points; automatic pagination and page thumbnails remain unimplemented. |
| Landing file drop | Implemented | Keyboard-accessible file picker and file drag-and-drop support DOCX, PDF, TXT, Markdown and HTML; unsupported extensions are rejected. |
| Document outline navigation | Implemented | Heading levels 1–3 are listed from the open editable document; heading filter and click-to-navigate use current document content. Collapsible panel on tablet and mobile. |
| Create blank document and basic editing | Implemented | Browser editing surface and Home/Insert/Layout/Review/View controls. |
| Structured document model | Partial | Versioned allow-listed node tree is now the source for local persistence and exports; the interactive editing surface still uses browser contenteditable. The canvas uses continuous scrolling and does not calculate printed page breaks. |
| Insert and edit tables | Partial | Insert up to 50 rows × 20 columns; table cells are editable. No row/column merge tools. |
| Insert local images | Implemented | PNG, JPEG and GIF up to 8 MB; stored in the browser document. |
| Autosave and reopen | Implemented | IndexedDB; preference is stored locally; Ctrl+S is available. |
| TXT, Markdown and HTML import | Implemented | Imports plain text into the editor; source HTML formatting is not preserved. |
| PDF viewing and download | Implemented | Browser PDF viewer; editing and page operations are not supported. |
| HTML export | Implemented | Downloads the current editable document as an HTML file. |
| Local document overview | Implemented | Extracts sentences from the current document; not an AI summary. |
| DOCX export | Partial | Creates a real OOXML `.docx` package; maps headings, emphasis, web links, lists, tables, header rows, column spans, PNG/JPEG/GIF images and page setup. Merged rows, WebP/SVG images, tracked revisions and advanced styles are not preserved. |
| DOCX import | Partial | Mammoth converts semantic structure in-browser; allow-listed HTML is sanitized. Headings, lists, tables and safe inline raster images can be edited. Word page layout, advanced styles, revisions and full fidelity are not preserved. |
| PDF annotation, modification or conversion | Not implemented | No PDF editing/conversion engine is included. |
| Hosted AI, translation or rewriting | Not implemented | No provider or backend is configured; no simulated results. |
| Accounts, cloud sync or shared documents | Not implemented | No identity or remote persistence service exists in this repository. |
| Find and replace | Implemented | Searches editable document text, navigates matches, and replaces one or all matches. Replace all is disabled above 5,000 matches to keep large edits bounded. |
| Strikethrough formatting | Implemented | Applies to selected text and persists through the local document model, DOCX import and DOCX export. |
| Document comments | Partial | Quote- and context-anchored comments are saved with the local document; comments can be resolved and reopened. Comments are not exported to DOCX. |
| Track changes and review history | Not implemented | The editor does not record or accept/reject tracked insertions or deletions, and DOCX revisions are not preserved. |


