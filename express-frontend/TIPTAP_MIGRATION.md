# TipTap Migration Guide

This document tracks the step-by-step migration from legacy editor to TipTap.

## Status: Phase 1-5 Complete

### ✅ Phase 1: Added TipTap Container
- Added `<div id="tiptap-workspace-editor" class="hidden">` to `workspace.ejs`
- Legacy editor container remains unchanged

### ✅ Phase 2: Created TipTap Bootstrap File
- Created `/js/tiptap-editor.js`
- Loads TipTap from CDN (esm.sh)
- Exposes `window.createTipTapEditor(element, initialContent)`
- Script tag added to `workspace.ejs` (before other scripts)

### ✅ Phase 3 & 4: Migration Logic in workspace.js
- Added `mountTipTapWorkspaceEditor()` function
- Added `switchWorkspaceEditor()` function  
- Added `window.USE_TIPTAP_EDITOR` flag (default: `false`)
- Global TipTap editor instance: `tiptapWorkspaceEditor`
- Migration code runs after DOM ready (with 500ms delay for TipTap to load)

### ✅ Phase 5: Disabled Legacy IME/Popups
- Added guards to `renderTranslitSuggestions()` - returns early if TipTap active
- Added guards to `clearTranslitSuggestions()` - returns early if TipTap active
- Added guards to `repositionTranslitDropdown()` - returns early if TipTap active
- Added guards to `handleEditorChange()` - returns early if TipTap active
- Added guards to `fetchRunnerSuggestions()` - returns [] if TipTap active

## Next Steps

### 🔄 Phase 6: Wire Toolbar to TipTap
- Need to modify toolbar button handlers in `editor.js` or create TipTap-aware handlers
- Map `data-command` attributes to TipTap commands:
  - `bold` → `editor.chain().focus().toggleBold().run()`
  - `italic` → `editor.chain().focus().toggleItalic().run()`
  - `undo` → `editor.chain().focus().undo().run()`
  - `redo` → `editor.chain().focus().redo().run()`
  - `insertUnorderedList` → `editor.chain().focus().toggleBulletList().run()`
  - `insertOrderedList` → `editor.chain().focus().toggleOrderedList().run()`

### 🔄 Phase 7: Update Save/Submit Integration
- Modify `saveDraft()` to use `tiptapWorkspaceEditor.getText()` or `getHTML()`
- Modify `runAutoSubmit()` to use TipTap methods
- Ensure backend receives correct format

### 🔄 Phase 8: Homepage Editor Migration
- Add TipTap container to `home.ejs`
- Mount TipTap editor for homepage
- Apply same IME and formatting features

### 🔄 Phase 9: Final Cleanup (After Validation)
- Delete legacy files:
  - `/js/editor.js`
  - `/js/suggestions.js` (if not needed for AI suggestions)
  - `/js/transliteration.js`
  - `/js/tamilUtils.js` (if not needed)
- Remove script tags from HTML

## Activation

To activate TipTap editor, set in `workspace.js`:

```javascript
window.USE_TIPTAP_EDITOR = true; // Change from false to true
```

## Testing Checklist

- [ ] TipTap editor loads and displays correctly
- [ ] No floating suggestion popup appears
- [ ] Toolbar buttons work (bold, italic, lists, etc.)
- [ ] IME suggestions appear inline (via TipTap extensions)
- [ ] Save/submit works correctly
- [ ] No console errors
- [ ] Legacy editor is hidden when TipTap is active

