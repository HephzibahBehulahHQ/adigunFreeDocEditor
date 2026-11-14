import { Editor } from "@tiptap/core";
import { editorExtensions } from "./editor-schema.js";

export function createLiveEditor({ element, onUpdate }) {
  const content = element.innerHTML;
  element.contentEditable = "false";
  const editor = new Editor({
    element,
    content,
    extensions: editorExtensions,
    onUpdate,
  });
  editor.view.dom.contentEditable = String(editor.isEditable);
  return editor;
}

if (typeof window !== "undefined") {
  window.AdigunEditorRuntime = { createLiveEditor };
}

