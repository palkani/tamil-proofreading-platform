'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import {
  IconUndo,
  IconRedo,
  IconBold,
  IconItalic,
  IconUnderline,
  IconStrikethrough,
  IconBulletList,
  IconNumberList,
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconAlignJustify,
  IconLink,
  IconSearch,
} from './icons';
import { transliterateTamilVariants, convertEnglishToTamil } from '@/utils/transliterate';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  onPlainTextChange?: (plain: string) => void;
  placeholder?: string;
  onPasteContent?: (payload: { html: string; plain: string }) => void;
}

const POPUP_WIDTH = 280;
const POPUP_HEIGHT = 220;
const POPUP_MARGIN = 12;

const clampPopupPosition = (coords: DOMRect, containerRect: DOMRect) => {
  if (typeof window === 'undefined') {
    return { left: coords.left, top: coords.bottom + 8, placement: 'below' as const };
  }

  let left = coords.left;
  let top = coords.bottom + 8;
  let placement: 'above' | 'below' = 'below';

  const minLeft = containerRect.left + POPUP_MARGIN;
  const maxLeft = containerRect.right - POPUP_WIDTH - POPUP_MARGIN;
  left = Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft));

  if (top + POPUP_HEIGHT + POPUP_MARGIN > containerRect.bottom) {
    top = coords.top - POPUP_HEIGHT - 8;
    placement = 'above';
  }

  const minTop = containerRect.top + POPUP_MARGIN;
  if (top < minTop) {
    top = minTop;
  }

  return { left, top, placement };
};

const toolbarButtonClasses = (active: boolean) =>
  `flex items-center justify-center h-12 w-12 rounded-xl text-lg font-semibold transition-all duration-200 ${
    active
      ? 'bg-[#4F46E5] text-white shadow-lg shadow-[#4F46E5]/30 scale-105'
      : 'text-[#475569] hover:bg-[#F8FAFC] hover:text-[#4F46E5] hover:scale-110 border-2 border-transparent hover:border-[#E2E8F0]'
  }`;

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  onPasteContent,
  onPlainTextChange,
}: RichTextEditorProps) {
  const [isTamil, setIsTamil] = useState(true);
  const [popupSuggestions, setPopupSuggestions] = useState<string[]>([]);
  const [popupCoords, setPopupCoords] = useState<{ left: number; top: number; placement: 'above' | 'below' } | null>(null);
  const [currentPrefix, setCurrentPrefix] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestionTimerRef = useRef<number | null>(null);
  const updateTimerRef = useRef<number | null>(null);
  const pasteCallbackRef = useRef<typeof onPasteContent>(onPasteContent);
  const isUpdatingFromPropsRef = useRef(false);
  const lastValueRef = useRef<string>('');
  const isInitialMountRef = useRef(true);

  useEffect(() => {
    pasteCallbackRef.current = onPasteContent;
  }, [onPasteContent]);

  const extensions = useMemo(() => {
    const base = [
      StarterKit.configure({
        heading: false,
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      TextAlign.configure({
        types: ['paragraph', 'heading'],
      }),
    ];

    return base;
  }, [isTamil]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: value || '<p></p>',
    editorProps: {
      attributes: {
        class:
          'h-full min-h-[40rem] overflow-y-auto border-2 border-[#E2E8F0] rounded-[28px] px-12 py-10 focus:outline-none bg-white shadow-lg focus:ring-4 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-all',
        style: 'color: #0F172A; font-size: 1.125rem; line-height: 2;',
        'aria-label': placeholder ?? 'Tamil text editor',
      },
    },
    onUpdate({ editor }) {
      // Skip update if we're programmatically setting content
      if (isUpdatingFromPropsRef.current) {
        return;
      }
      
      // Debounce rapid updates to prevent infinite loops
      if (updateTimerRef.current) {
        window.clearTimeout(updateTimerRef.current);
      }
      
      updateTimerRef.current = window.setTimeout(() => {
        const htmlContent = editor.getHTML();
        const plainText = editor.getText();
        
        // Only call onChange if content actually changed
        if (htmlContent !== lastValueRef.current) {
          lastValueRef.current = htmlContent;
          onChange(htmlContent);
          onPlainTextChange?.(plainText);
        }
      }, 50);
    },
  });

  useEffect(() => {
    if (!editor) return;
    
    // Skip if we're currently updating from props
    if (isUpdatingFromPropsRef.current) return;
    
    const current = editor.getHTML();
    const normalizedValue = (value || '<p></p>').trim();
    const normalizedCurrent = current.trim();
    
    // On initial mount, set content immediately and mark as mounted
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      if (normalizedValue !== normalizedCurrent) {
        isUpdatingFromPropsRef.current = true;
        try {
          editor.commands.setContent(value || '<p></p>', { emitUpdate: false });
          lastValueRef.current = editor.getHTML();
        } catch (err) {
          console.error('Error setting initial editor content:', err);
        }
        setTimeout(() => {
          isUpdatingFromPropsRef.current = false;
        }, 100);
      } else {
        lastValueRef.current = normalizedValue;
      }
      return;
    }
    
    // Only update if the value actually changed and is different from current content
    // Also check against lastValueRef to prevent loops
    if (normalizedValue !== normalizedCurrent && normalizedValue !== lastValueRef.current) {
      isUpdatingFromPropsRef.current = true;
      lastValueRef.current = normalizedValue;
      
      // Use setTimeout to make this non-blocking
      setTimeout(() => {
        try {
          // Use setContent with emitUpdate: false to prevent triggering onUpdate
          editor.commands.setContent(value || '<p></p>', { emitUpdate: false });
          // Update lastValueRef immediately to prevent duplicate updates
          lastValueRef.current = editor.getHTML();
        } catch (err) {
          console.error('Error setting editor content:', err);
          isUpdatingFromPropsRef.current = false;
          return;
        }
        
        // Reset flag after the update completes
        setTimeout(() => {
          isUpdatingFromPropsRef.current = false;
        }, 200);
      }, 0);
    } else if (normalizedValue === normalizedCurrent) {
      // If values match, update lastValueRef to prevent false positives
      lastValueRef.current = normalizedValue;
    }
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    editor.setOptions({ extensions });
  }, [editor, extensions]);

  useEffect(() => {
    if (!editor) return;
    
    // Inject a style tag to ensure text is visible
    const styleId = 'tiptap-text-color-fix';
    let styleElement = document.getElementById(styleId) as HTMLStyleElement;
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.textContent = `
        .ProseMirror,
        .ProseMirror * {
          color: #0F172A !important;
          opacity: 1 !important;
          visibility: visible !important;
        }
      `;
      document.head.appendChild(styleElement);
    }
    
    const applyTextColor = () => {
      const proseMirror = editor.view.dom as HTMLElement;
      if (proseMirror) {
        // Set color directly on the ProseMirror element
        proseMirror.style.setProperty('color', '#0F172A', 'important');
        proseMirror.style.setProperty('opacity', '1', 'important');
        proseMirror.style.setProperty('visibility', 'visible', 'important');
        
        // Set color on all text-containing elements (batch via CSS is already applied)
        // This is a lightweight one-time pass to correct any inline overrides
        const allElements = proseMirror.querySelectorAll('*');
        allElements.forEach((el) => {
          const htmlEl = el as HTMLElement;
          htmlEl.style.setProperty('color', '#0F172A', 'important');
          htmlEl.style.setProperty('opacity', '1', 'important');
          htmlEl.style.setProperty('visibility', 'visible', 'important');
        });
      }
    };
    
    // Apply immediately and after short delays to catch initial render without continuous observers
    applyTextColor();
    const t1 = window.setTimeout(applyTextColor, 100);
    const t2 = window.setTimeout(applyTextColor, 500);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const handlePaste = (event: ClipboardEvent) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      const pastedText = clipboardData.getData('text/plain');
      if (!pastedText) return;

      // Convert English to Tamil if detected
      const convertedText = convertEnglishToTamil(pastedText);
      
      // If text was converted, replace the pasted content
      if (convertedText !== pastedText) {
        event.preventDefault();
        // Get current selection
        const { state, dispatch } = editor.view;
        const { selection } = state;
        
        // Insert the converted text
        const transaction = state.tr.insertText(convertedText, selection.from, selection.to);
        dispatch(transaction);
        
        // Trigger the paste callback after a short delay
        window.setTimeout(() => {
          const plainText = editor.getText();
          const htmlContent = editor.getHTML();
          const callback = pasteCallbackRef.current;
          if (callback) {
            callback({ html: htmlContent, plain: plainText });
          }
        }, 30);
        return;
      }

      // If no conversion, let TipTap handle it normally and trigger callback
      window.setTimeout(() => {
        const plainText = editor.getText();
        const htmlContent = editor.getHTML();
        const callback = pasteCallbackRef.current;
        if (callback) {
          callback({ html: htmlContent, plain: plainText });
        }
      }, 30);
    };

    dom.addEventListener('paste', handlePaste);
    return () => {
      dom.removeEventListener('paste', handlePaste);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    const updateSuggestions = () => {
      if (!isTamil) {
        setPopupSuggestions([]);
        setPopupCoords(null);
        return;
      }

      const selection = editor.state.selection;
      const { from } = selection;
      const textBefore = editor.state.doc.textBetween(Math.max(0, from - 40), from, '\n', ' ');
      const match = textBefore.match(/([A-Za-z]+)$/);
      const prefix = match ? match[1] : '';
      setCurrentPrefix(prefix);

      if (prefix.length >= 2 && /^[a-z]+$/i.test(prefix)) {
        const variants = transliterateTamilVariants(prefix.toLowerCase(), 6);
        if (variants.length > 0) {
          const coords = editor.view.coordsAtPos(from) as DOMRect;
          const containerRect = (editor.view.dom as HTMLElement).getBoundingClientRect();
          const safePosition = clampPopupPosition(coords, containerRect);
          setPopupCoords(safePosition);
          setPopupSuggestions(variants);
          setActiveIndex(0);
          return;
        }
      }

      setPopupSuggestions([]);
      setPopupCoords(null);
    };

    const debouncedUpdate = () => {
      if (suggestionTimerRef.current) {
        window.clearTimeout(suggestionTimerRef.current);
      }
      suggestionTimerRef.current = window.setTimeout(updateSuggestions, 120);
    };

    const dom = editor.view.dom;
    dom.addEventListener('keyup', debouncedUpdate);
    dom.addEventListener('click', debouncedUpdate);

    return () => {
      if (suggestionTimerRef.current) {
        window.clearTimeout(suggestionTimerRef.current);
      }
      dom.removeEventListener('keyup', debouncedUpdate);
      dom.removeEventListener('click', debouncedUpdate);
    };
  }, [editor, isTamil]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;

    const keyHandler = (event: KeyboardEvent) => {
      if (!popupSuggestions.length) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((prev) => (prev + 1) % popupSuggestions.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((prev) => (prev - 1 + popupSuggestions.length) % popupSuggestions.length);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        insertSuggestion(popupSuggestions[activeIndex]);
      } else if (event.key === 'Escape') {
        setPopupSuggestions([]);
        setPopupCoords(null);
      }
    };

    dom.addEventListener('keydown', keyHandler);
    return () => dom.removeEventListener('keydown', keyHandler);
  }, [editor, popupSuggestions, activeIndex]);

  useEffect(() => {
    if (!isTamil) {
      setPopupSuggestions([]);
      setPopupCoords(null);
    }
  }, [isTamil]);

  if (!editor) {
    return (
      <div className="min-h-[18rem] border border-gray-300 rounded-xl p-4 text-gray-400">
        Loading editor...
      </div>
    );
  }

  const insertSuggestion = (suggestion: string) => {
    if (!editor) return;
    const { from } = editor.state.selection;
    const deleteFrom = Math.max(0, from - currentPrefix.length);
    editor
      .chain()
      .focus()
      .deleteRange({ from: deleteFrom, to: from })
      .insertContent(`${suggestion} `)
      .run();
    setPopupSuggestions([]);
    setPopupCoords(null);
    setActiveIndex(0);
  };

  return (
    <div className="flex h-full flex-col bg-white rounded-3xl border-2 border-[#E2E8F0] shadow-xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 px-8 py-5 border-b-2 border-[#E2E8F0] bg-[#F8FAFC]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            className="flex items-center justify-center h-12 w-12 text-[#475569] hover:bg-white hover:text-[#4F46E5] rounded-xl transition-all duration-200 hover:scale-110 border-2 border-transparent hover:border-[#E2E8F0]"
            title="Undo (Ctrl+Z)"
          >
            <IconUndo width={20} height={20} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            className="flex items-center justify-center h-12 w-12 text-[#475569] hover:bg-white hover:text-[#4F46E5] rounded-xl transition-all duration-200 hover:scale-110 border-2 border-transparent hover:border-[#E2E8F0]"
            title="Redo (Ctrl+Y)"
          >
            <IconRedo width={20} height={20} />
          </button>
          <div className="h-8 w-px bg-[#E2E8F0] mx-2"></div>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={toolbarButtonClasses(editor.isActive('bold'))}
            title="Bold (Ctrl+B)"
          >
            <IconBold width={20} height={20} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={toolbarButtonClasses(editor.isActive('italic'))}
            title="Italic (Ctrl+I)"
          >
            <IconItalic width={20} height={20} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline?.().run?.() || editor.commands.toggleBold()}
            className={toolbarButtonClasses(false)}
            title="Underline (Ctrl+U)"
          >
            <IconUnderline width={20} height={20} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={toolbarButtonClasses(editor.isActive('strike'))}
            title="Strikethrough"
          >
            <IconStrikethrough width={20} height={20} />
          </button>
          <div className="h-8 w-px bg-[#E2E8F0] mx-2"></div>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={toolbarButtonClasses(editor.isActive('bulletList'))}
            title="Bullet List"
          >
            <IconBulletList width={20} height={20} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={toolbarButtonClasses(editor.isActive('orderedList'))}
            title="Numbered List"
          >
            <IconNumberList width={20} height={20} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            className={toolbarButtonClasses(editor.isActive({ textAlign: 'left' }))}
            title="Align Left"
          >
            <IconAlignLeft width={20} height={20} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            className={toolbarButtonClasses(editor.isActive({ textAlign: 'center' }))}
            title="Align Center"
          >
            <IconAlignCenter width={20} height={20} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            className={toolbarButtonClasses(editor.isActive({ textAlign: 'right' }))}
            title="Align Right"
          >
            <IconAlignRight width={20} height={20} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
            className={toolbarButtonClasses(editor.isActive({ textAlign: 'justify' }))}
            title="Justify"
          >
            <IconAlignJustify width={20} height={20} />
          </button>
          <div className="h-8 w-px bg-[#E2E8F0] mx-2"></div>
          <button
            type="button"
            className="flex items-center justify-center h-12 w-12 text-[#475569] hover:bg-[#F8FAFC] hover:text-[#4F46E5] rounded-xl transition-all duration-200 hover:scale-110 border-2 border-transparent hover:border-[#E2E8F0]"
            title="Insert Link"
          >
            <IconLink width={20} height={20} />
          </button>
          <button
            type="button"
            className="flex items-center justify-center h-12 w-12 text-[#475569] hover:bg-[#F8FAFC] hover:text-[#4F46E5] rounded-xl transition-all duration-200 hover:scale-110 border-2 border-transparent hover:border-[#E2E8F0]"
            title="Search"
          >
            <IconSearch width={20} height={20} />
          </button>
        </div>

        <div className="flex items-center">
          <button
            type="button"
            onClick={() =>
              setIsTamil((prev) => {
                const next = !prev;
                if (!next) {
                  setPopupSuggestions([]);
                  setPopupCoords(null);
                }
                return next;
              })
            }
            className={`flex items-center gap-3 px-6 py-3 rounded-xl text-base font-semibold transition-all duration-200 border-2 ${
              isTamil
                ? 'bg-[#4F46E5] text-white shadow-lg shadow-[#4F46E5]/30 border-[#4F46E5]'
                : 'text-[#475569] hover:bg-[#F8FAFC] hover:text-[#4F46E5] border-[#E2E8F0]'
            }`}
            title={isTamil ? 'Switch to English' : 'Switch to Tamil'}
          >
            {isTamil ? 'தமிழ்' : 'English'}
          </button>
        </div>
      </div>

      <div 
        className="flex-1 min-h-0 overflow-auto px-6 py-4" 
        style={{ 
          color: '#0F172A',
          opacity: 1,
          visibility: 'visible'
        }}
      >
        <EditorContent editor={editor} />
      </div>

      {popupCoords && popupSuggestions.length > 0 && (
        <div
          className={`fixed z-50 glass border border-white/50 rounded-2xl shadow-xl shadow-[#6366F1]/20 text-sm text-[#1E293B] backdrop-blur-xl ${popupCoords.placement === 'above' ? 'origin-bottom-left' : 'origin-top-left'}`}
          style={{ left: popupCoords.left, top: popupCoords.top, width: POPUP_WIDTH }}
        >
          <ul className="max-h-48 overflow-y-auto divide-y divide-white/20">
            {popupSuggestions.map((suggestion, index) => (
              <li key={suggestion}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertSuggestion(suggestion)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`w-full text-left px-4 py-3 transition-all duration-200 rounded-lg mx-1 my-1 ${
                    index === activeIndex
                      ? 'bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white shadow-lg scale-105'
                      : 'hover:bg-white/50 text-[#1E293B] hover:scale-102'
                  }`}
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex border-t border-white/20 bg-gradient-to-r from-white/50 to-[#6366F1]/5 rounded-b-2xl">
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setActiveIndex((prev) => (prev - 1 + popupSuggestions.length) % popupSuggestions.length)}
              className="flex-1 px-4 py-2.5 text-xs font-semibold text-[#6366F1] hover:bg-white/50 rounded-bl-2xl transition-all"
            >
              ↑
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setActiveIndex((prev) => (prev + 1) % popupSuggestions.length)}
              className="flex-1 px-4 py-2.5 text-xs font-semibold text-[#6366F1] hover:bg-white/50 rounded-br-2xl transition-all"
            >
              ↓
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
