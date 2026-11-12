# Feature matrix

Status is specific to the current first workspace slice.

| Feature | Current status | Evidence / limit |
|---|---|---|
| Responsive workspace shell and entry screen | Implemented | `index.html` and responsive rules in `styles.css`. |
| Create blank document and basic editing | Implemented | Browser editing surface and Home/Insert/Layout/Review/View controls. |
| Autosave and reopen | Implemented | IndexedDB; preference is stored locally; Ctrl+S is available. |
| TXT, Markdown and HTML import | Implemented | Imports plain text into the editor; source HTML formatting is not preserved. |
| PDF viewing and download | Implemented | Browser PDF viewer; editing and page operations are not supported. |
| HTML export | Implemented | Downloads the current editable document as an HTML file. |
| Local document overview | Implemented | Extracts sentences from the current document; not an AI summary. |
| DOCX export | Partial | Creates a real OOXML `.docx` package; maps headings, emphasis, web links, lists and page setup. Tables, images, tracked revisions and advanced styles are not preserved. |
| DOCX import | Partial | Mammoth converts semantic structure in-browser; allow-listed HTML is sanitized. Headings, lists, tables and safe inline raster images can be edited. Word page layout, advanced styles, revisions and full fidelity are not preserved. |
| PDF annotation, modification or conversion | Not implemented | No PDF editing/conversion engine is included. |
| Hosted AI, translation or rewriting | Not implemented | No provider or backend is configured; no simulated results. |
| Accounts, cloud sync or shared documents | Not implemented | No identity or remote persistence service exists in this repository. |
| Track changes and review history | Not implemented | Not represented as a live control in the interface. |

