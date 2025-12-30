'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
// Note: Install these packages: npm install @tiptap/extension-underline @tiptap/extension-link
// For now, we'll use what's available in StarterKit (strike is included)
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
  IconLink,
  IconSearch,
  IconMicrophone,
  IconFontSize,
} from './icons';
import { convertEnglishToTamil } from '@/utils/transliterate';
import { TamilIME } from '@/src/editor/extensions/TamilIME';
import { GrammarHighlighter } from '@/src/editor/extensions/GrammarHighlighter';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  onPlainTextChange?: (plain: string) => void;
  placeholder?: string;
  onPasteContent?: (payload: { html: string; plain: string }) => void;
}



export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  onPasteContent,
  onPlainTextChange,
}: RichTextEditorProps) {
  // Load Tamil IME preference from localStorage, default to true
  const [tamilIMEEnabled, setTamilIMEEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tamilIMEEnabled');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });
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
        // Strike is included in StarterKit
      }),
      TextAlign.configure({
        types: ['paragraph', 'heading'],
      }),
      // Note: To enable Underline and Link, install:
      // npm install @tiptap/extension-underline @tiptap/extension-link
      // Then uncomment:
      // Underline,
      // Link.configure({
      //   openOnClick: false,
      //   HTMLAttributes: {
      //     class: 'text-blue-600 underline cursor-pointer',
      //   },
      // }),
      TamilIME.configure({
        enabled: tamilIMEEnabled,
        autoCommitOnSpace: true,
      }),
      GrammarHighlighter,
    ];

    return base;
  }, [tamilIMEEnabled]);

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


  if (!editor) {
    return (
      <div className="min-h-[18rem] border border-gray-300 rounded-xl p-4 text-gray-400">
        Loading editor...
      </div>
    );
  }

  const [linkUrl, setLinkUrl] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [fontSize, setFontSize] = useState('16px');

  const handleSetLink = useCallback(() => {
    if (linkUrl) {
      editor.chain().focus().setLink({ href: linkUrl }).run();
    } else {
      editor.chain().focus().unsetLink().run();
    }
    setShowLinkInput(false);
    setLinkUrl('');
  }, [editor, linkUrl]);

  return (
    <div className="flex h-full flex-col bg-white rounded-3xl border-2 border-[#E2E8F0] shadow-xl overflow-hidden">
      {/* Full Toolbar - Always Visible */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-[#E2E8F0] bg-[#F8FAFC] flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {/* Undo/Redo */}
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            className="flex items-center justify-center h-8 w-8 text-[#475569] hover:bg-white hover:text-[#4F46E5] rounded transition-colors"
            title="Undo (Ctrl+Z)"
          >
            <IconUndo width={16} height={16} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            className="flex items-center justify-center h-8 w-8 text-[#475569] hover:bg-white hover:text-[#4F46E5] rounded transition-colors"
            title="Redo (Ctrl+Y)"
          >
            <IconRedo width={16} height={16} />
          </button>
          
          <div className="w-px h-6 bg-[#E2E8F0] mx-1" />
          
          {/* Font Size Dropdown */}
          <div className="relative">
            <button
              type="button"
              className="flex items-center justify-center h-8 px-2 text-[#475569] hover:bg-white hover:text-[#4F46E5] rounded transition-colors text-xs font-medium"
              title="Font Size"
            >
              <IconFontSize width={14} height={14} className="mr-1" />
              <span className="text-xs">T</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="ml-1">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          
          <div className="w-px h-6 bg-[#E2E8F0] mx-1" />
          
          {/* Text Formatting */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`flex items-center justify-center h-8 w-8 rounded transition-colors ${
              editor.isActive('bold')
                ? 'bg-[#4F46E5] text-white'
                : 'text-[#475569] hover:bg-white hover:text-[#4F46E5]'
            }`}
            title="Bold (Ctrl+B)"
          >
            <IconBold width={16} height={16} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`flex items-center justify-center h-8 w-8 rounded transition-colors ${
              editor.isActive('italic')
                ? 'bg-[#4F46E5] text-white'
                : 'text-[#475569] hover:bg-white hover:text-[#4F46E5]'
            }`}
            title="Italic (Ctrl+I)"
          >
            <IconItalic width={16} height={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              // Note: Requires @tiptap/extension-underline package
              // editor.chain().focus().toggleUnderline().run();
              console.log('Underline - requires @tiptap/extension-underline package');
            }}
            className="flex items-center justify-center h-8 w-8 text-[#475569] hover:bg-white hover:text-[#4F46E5] rounded transition-colors opacity-50"
            title="Underline (requires package installation)"
          >
            <IconUnderline width={16} height={16} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`flex items-center justify-center h-8 w-8 rounded transition-colors ${
              editor.isActive('strike')
                ? 'bg-[#4F46E5] text-white'
                : 'text-[#475569] hover:bg-white hover:text-[#4F46E5]'
            }`}
            title="Strikethrough"
          >
            <IconStrikethrough width={16} height={16} />
          </button>
          
          <div className="w-px h-6 bg-[#E2E8F0] mx-1" />
          
          {/* Lists */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`flex items-center justify-center h-8 w-8 rounded transition-colors ${
              editor.isActive('bulletList')
                ? 'bg-[#4F46E5] text-white'
                : 'text-[#475569] hover:bg-white hover:text-[#4F46E5]'
            }`}
            title="Bullet List"
          >
            <IconBulletList width={16} height={16} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`flex items-center justify-center h-8 w-8 rounded transition-colors ${
              editor.isActive('orderedList')
                ? 'bg-[#4F46E5] text-white'
                : 'text-[#475569] hover:bg-white hover:text-[#4F46E5]'
            }`}
            title="Numbered List"
          >
            <IconNumberList width={16} height={16} />
          </button>
          
          <div className="w-px h-6 bg-[#E2E8F0] mx-1" />
          
          {/* Alignment */}
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            className={`flex items-center justify-center h-8 w-8 rounded transition-colors ${
              editor.isActive({ textAlign: 'left' })
                ? 'bg-[#4F46E5] text-white'
                : 'text-[#475569] hover:bg-white hover:text-[#4F46E5]'
            }`}
            title="Align Left"
          >
            <IconAlignLeft width={16} height={16} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            className={`flex items-center justify-center h-8 w-8 rounded transition-colors ${
              editor.isActive({ textAlign: 'center' })
                ? 'bg-[#4F46E5] text-white'
                : 'text-[#475569] hover:bg-white hover:text-[#4F46E5]'
            }`}
            title="Align Center"
          >
            <IconAlignCenter width={16} height={16} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            className={`flex items-center justify-center h-8 w-8 rounded transition-colors ${
              editor.isActive({ textAlign: 'right' })
                ? 'bg-[#4F46E5] text-white'
                : 'text-[#475569] hover:bg-white hover:text-[#4F46E5]'
            }`}
            title="Align Right"
          >
            <IconAlignRight width={16} height={16} />
          </button>
          
          <div className="w-px h-6 bg-[#E2E8F0] mx-1" />
          
          {/* Link */}
          <button
            type="button"
            onClick={() => {
              // Note: Requires @tiptap/extension-link package
              // const url = editor.getAttributes('link').href;
              // if (url) {
              //   setLinkUrl(url);
              // }
              // setShowLinkInput(!showLinkInput);
              console.log('Link - requires @tiptap/extension-link package');
            }}
            className="flex items-center justify-center h-8 w-8 text-[#475569] hover:bg-white hover:text-[#4F46E5] rounded transition-colors opacity-50"
            title="Insert Link (requires package installation)"
          >
            <IconLink width={16} height={16} />
          </button>
          
          {/* Search */}
          <button
            type="button"
            className="flex items-center justify-center h-8 w-8 text-[#475569] hover:bg-white hover:text-[#4F46E5] rounded transition-colors"
            title="Search"
          >
            <IconSearch width={16} height={16} />
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Tamil Toggle */}
          <button
            type="button"
            onClick={() => {
              setTamilIMEEnabled(!tamilIMEEnabled);
              localStorage.setItem('tamilIMEEnabled', String(!tamilIMEEnabled));
            }}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
              tamilIMEEnabled
                ? 'bg-[#4F46E5] text-white shadow-md hover:bg-[#4338CA]'
                : 'bg-white text-[#475569] hover:bg-gray-50 border border-[#E2E8F0] hover:border-[#CBD5E1]'
            }`}
            title={tamilIMEEnabled ? 'Disable Tamil transliteration' : 'Enable Tamil transliteration'}
          >
            <span className="text-base font-bold">தமிழ்</span>
          </button>
          
          {/* Microphone */}
          <button
            type="button"
            className="flex items-center justify-center h-8 w-8 text-[#4F46E5] hover:bg-[#4F46E5]/10 rounded transition-colors"
            title="Voice Input"
          >
            <IconMicrophone width={18} height={18} />
          </button>
        </div>
      </div>
      
      {/* Link Input */}
      {showLinkInput && (
        <div className="px-4 py-2 border-b border-[#E2E8F0] bg-white flex items-center gap-2">
          <input
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="Enter URL..."
            className="flex-1 px-3 py-1.5 text-sm border border-[#E2E8F0] rounded focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSetLink();
              } else if (e.key === 'Escape') {
                setShowLinkInput(false);
                setLinkUrl('');
              }
            }}
            autoFocus
          />
          <button
            type="button"
            onClick={handleSetLink}
            className="px-3 py-1.5 text-sm bg-[#4F46E5] text-white rounded hover:bg-[#4338CA] transition-colors"
          >
            Set
          </button>
          <button
            type="button"
            onClick={() => {
              setShowLinkInput(false);
              setLinkUrl('');
            }}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

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

    </div>
  );
}
