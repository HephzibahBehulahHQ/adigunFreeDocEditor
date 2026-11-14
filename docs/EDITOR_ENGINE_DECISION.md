# Editor engine decision

## Decision

Use Tiptap on ProseMirror as the transaction-based editing engine. Keep the existing responsive interface and the versioned `AdigunDocumentModel` as the persistence and export boundary while the editing surface is migrated.

Use a pinned local build of the editor packages. Do not load editor modules from a runtime CDN: documents must remain editable without sending their content or application code to a third-party service.

## Why

The app is plain JavaScript and already has a normalized document model, HTML import/export, and OOXML mapping. Tiptap supports plain JavaScript, schema-defined content, editor transactions, and extensions for undo/redo and tables. A local bundle can connect those editor transactions to the existing model without introducing a front-end framework.

## Integration constraints

- Preserve the existing document JSON format and migration from saved HTML. Editor JSON is not a new persistence format.
- Preserve the current toolbar, keyboard behavior, review metadata, document tabs, import/export warnings, and supported DOCX mappings as they are migrated.
- The current pagination code moves and wraps live editor DOM into paper sheets. Tiptap owns its rendered editing DOM, so pagination must be redesigned around engine-owned nodes or decorations before replacing the current surface. Do not run two editable surfaces or let external DOM rewrites mutate the engine view.
- Keep comments as sidecar metadata unless a tested mapping between comment anchors and engine positions is added.
- Model tracked insertions and deletions as schema-supported marks or nodes with the existing revision ID, author, and timestamp attributes.
- Retain the current import sanitization and attribute allow-lists at the model boundary.

## Migration gates

1. Build a fixture that parses and serializes every currently supported node, mark, and custom attribute through the engine schema.
2. Verify representative HTML and DOCX round trips, including nested lists, merged table cells, images, page breaks, and tracked text.
3. Move page-sheet rendering into engine-compatible rendering without changing the visible workspace layout.
4. Connect toolbar commands, selection state, autosave, comments, and review actions to editor transactions.
5. Remove the old `contenteditable` command path only after the feature and round-trip checks pass.

## References

- [Tiptap with vanilla JavaScript](https://tiptap.dev/docs/editor/getting-started/install/vanilla-javascript)
- [Tiptap editor schema](https://tiptap.dev/docs/editor/core-concepts/schema)
- [Tiptap undo/redo](https://tiptap.dev/docs/editor/extensions/functionality/undo-redo)
- [Tiptap table extension](https://tiptap.dev/docs/editor/extensions/nodes/table)

