package handlers

import (
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// WorkspacePage serves the authenticated workspace HTML from Cloud Run.
// Auth is enforced via the existing JWT (access_token) issued by the backend.
func (h *Handlers) WorkspacePage(c *gin.Context) {
	reqID := c.GetString("request_id")

	tokenString := ""
	if cookieToken, err := c.Cookie("access_token"); err == nil && strings.TrimSpace(cookieToken) != "" {
		tokenString = cookieToken
	}
	if tokenString == "" {
		authHeader := c.GetHeader("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenString = strings.TrimPrefix(authHeader, "Bearer ")
		}
	}
	if tokenString == "" {
		tokenString = c.Query("access_token")
	}

	if tokenString == "" {
		log.Printf("[WORKSPACE] auth failed (no token) request_id=%s", reqID)
		c.Redirect(http.StatusTemporaryRedirect, "https://www.prooftamil.com/login?redirect=/workspace")
		return
	}

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return []byte(h.cfg.JWTSecret), nil
	})
	if err != nil || !token.Valid {
		log.Printf("[WORKSPACE] auth failed (invalid token) request_id=%s err=%v", reqID, err)
		c.Redirect(http.StatusTemporaryRedirect, "https://www.prooftamil.com/login?redirect=/workspace")
		return
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		log.Printf("[WORKSPACE] auth failed (claims cast) request_id=%s", reqID)
		c.Redirect(http.StatusTemporaryRedirect, "https://www.prooftamil.com/login?redirect=/workspace")
		return
	}

	var userID interface{}
	if uid, ok := claims["user_id"]; ok {
		userID = uid
	}

	log.Printf("[WORKSPACE] auth success request_id=%s user_id=%v", reqID, userID)

	c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(workspacePageHTML))
}

// Static workspace HTML shell that relies on existing front-end assets served by Vercel.
// The page structure matches the current workspace EJS so the JS bundle continues to work.
const workspacePageHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ProofTamil Workspace</title>
  <link rel="stylesheet" href="/css/output.css">
  <style>
    .workspace-layout {
      display: grid;
      grid-template-columns: 1fr 384px;
      overflow: hidden;
      min-height: 0;
    }
    .workspace-editor-panel,
    .workspace-ai-panel {
      min-height: 0;
    }
    .workspace-editor-panel .flex-1 {
      min-height: 0;
    }
    @media (max-width: 768px) {
      .workspace-layout {
        display: flex;
        flex-direction: column;
        height: auto;
      }
      .workspace-editor-panel {
        min-height: 60vh;
        max-height: none;
        overflow: visible;
      }
      .workspace-ai-panel {
        position: relative;
        width: 100%;
        max-height: none;
        overflow: visible;
        border-left: none !important;
        border-top: 1px solid #e5e7eb;
      }
    }
  </style>
</head>
<body class="bg-slate-50">
<div id="workspace-auth-banner" class="hidden bg-yellow-50 border-b border-yellow-200 text-yellow-800 px-4 py-3 flex items-center justify-between">
  <span>No access token detected. Please sign in to sync your workspace.</span>
  <a href="/login" class="btn-primary text-sm">Login</a>
</div>

<!-- Mode selector -->
<div class="flex items-center gap-3 mb-2 px-4 pt-4">
  <label for="mode-select" class="text-sm text-gray-700">Mode:</label>
  <select id="mode-select" class="toolbar-select">
    <option value="spoken">Spoken Tamil</option>
    <option value="formal">Written / Formal</option>
    <option value="academic">Academic / Article</option>
  </select>
</div>

<!-- Transliteration suggestion strip -->
<div id="translit-suggest-box" class="hidden bg-white border border-gray-200 rounded-lg px-3 py-2 mt-2 text-sm shadow-sm mx-4">
  <div id="translit-suggest-status" class="text-gray-600">Type English to see Tamil suggestions…</div>
  <ul id="translit-suggest-list" class="mt-1 space-y-1"></ul>
</div>

<div class="min-h-screen flex flex-col">
  <!-- Header -->
  <header class="bg-white border-b border-gray-200 px-6 py-3">
    <div class="flex items-center justify-between">
      <!-- Left: Back to Drafts -->
      <div>
        <button id="show-drafts-btn" class="text-gray-600 hover:text-gray-900 flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
          <span class="font-medium">My Drafts</span>
        </button>
      </div>

      <!-- Center: Editable Title -->
      <div class="flex-1 max-w-md mx-8">
        <input 
          type="text" 
          id="draft-title"
          class="w-full text-lg font-semibold text-center border-0 border-b-2 border-transparent hover:border-gray-300 focus:border-primary-600 focus:ring-0 outline-none px-4 py-1 transition-colors"
          value="Untitled Draft"
          placeholder="Draft title..."
        />
      </div>

      <!-- Right: Save Status & Actions -->
      <div class="flex items-center gap-4">
        <span id="save-status" class="text-sm text-gray-500">
          <span class="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>
          Saved
        </span>
        <button id="logout-btn" class="text-gray-600 hover:text-gray-900">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
        </button>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <div class="flex-1 workspace-layout">
    <!-- Drafts List View (Hidden by default) -->
    <div id="drafts-list-view" class="hidden bg-slate-50 overflow-auto" style="grid-column: 1 / -1;">
      <div class="max-w-4xl mx-auto px-6 py-8">
        <div class="mb-6">
          <h2 class="text-2xl font-bold text-gray-900 mb-2">My Drafts</h2>
          <p class="text-sm text-gray-600">All your Tamil text submissions and drafts</p>
        </div>

        <div class="flex justify-between items-center mb-4">
          <button id="new-draft-btn" class="btn-primary">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            New Draft
          </button>
          <div id="drafts-loading" class="hidden text-sm text-gray-500">Loading drafts...</div>
        </div>

        <div id="drafts-container" class="space-y-3">
          <!-- Drafts will be loaded here -->
        </div>

        <div id="no-drafts-message" class="hidden text-center py-12">
          <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <p class="text-gray-600">No drafts yet. Start by creating a new draft.</p>
          <button id="create-first-draft-btn" class="btn-primary mt-3">Create First Draft</button>
        </div>
      </div>
    </div>

    <!-- Editor Panel -->
    <div class="workspace-editor-panel bg-white border-r border-gray-200 flex flex-col min-h-0">
      <!-- Toolbar -->
      <div class="flex items-center gap-3 px-6 py-3 border-b border-gray-200">
        <div class="flex items-center gap-2">
          <button class="toolbar-btn" data-command="bold" title="Bold (Ctrl+B)">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V7a2 2 0 012-2h3M7 13h6a2 2 0 012 2v3a2 2 0 01-2 2H7V7h4"/>
            </svg>
          </button>
          <button class="toolbar-btn" data-command="italic" title="Italic (Ctrl+I)">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 4h-4m0 0H7m3 0h4l-3 16h-4l3-16z"/>
            </svg>
          </button>
          <button class="toolbar-btn" data-command="underline" title="Underline (Ctrl+U)">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 3v8a5 5 0 0010 0V3m-7 18h6"/>
            </svg>
          </button>
        </div>

        <div class="flex items-center gap-2">
          <select id="font-family" class="toolbar-select">
            <option value="inter">Inter</option>
            <option value="serif">Serif</option>
            <option value="mono">Monospace</option>
          </select>
          <select id="font-size" class="toolbar-select">
            <option value="14">14</option>
            <option value="16" selected>16</option>
            <option value="18">18</option>
            <option value="20">20</option>
          </select>
        </div>

        <div class="flex items-center gap-2">
          <button class="toolbar-btn" data-command="align-left" title="Align Left">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h10M4 14h16M4 18h10"/>
            </svg>
          </button>
          <button class="toolbar-btn" data-command="align-center" title="Align Center">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 6h8M4 10h16M8 14h8M4 18h16"/>
            </svg>
          </button>
          <button class="toolbar-btn" data-command="align-right" title="Align Right">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M10 10h10M4 14h16M10 18h10"/>
            </svg>
          </button>
        </div>

        <div class="flex items-center gap-2 ml-auto">
          <button id="toggle-ai-panel" class="toolbar-btn" title="Toggle AI Assistant">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14m0-4l-4.553-2.276A1 1 0 009 8.618v6.764a1 1 0 001.447.894L15 14m0-4v4"/>
            </svg>
          </button>
          <button id="toggle-transliterate" class="toolbar-btn" title="Toggle Transliteration">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-6a2 2 0 012-2h6m-8 8h8m0 0l-3-3m3 3l-3 3M5 9h.01M5 5h.01M5 13h.01"/>
            </svg>
          </button>
          <button id="clear-text-btn" class="toolbar-btn" title="Clear Text">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Editor -->
      <div class="flex-1 flex flex-col min-h-0">
        <div class="flex-1 overflow-auto p-6">
          <div id="editor" class="editor-content min-h-[420px]" contenteditable="true"></div>
          <div id="proofread-highlights"></div>
        </div>

        <!-- Footer status -->
        <div class="border-t border-gray-200 bg-gray-50 px-6 py-3 flex items-center justify-between">
          <div class="text-sm text-gray-500" id="autosave-time"></div>
          <div class="flex items-center gap-4 text-sm text-gray-500">
            <span id="word-count">Words: 0</span>
            <span id="accepted-count">Accepted: 0</span>
          </div>
        </div>
      </div>
    </div>

    <!-- AI Assistant Panel -->
    <div class="workspace-ai-panel bg-white border-l border-gray-200 flex flex-col">
      <div class="p-6 border-b border-gray-200">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold text-gray-900">AI Assistant</h2>
            <p class="text-sm text-gray-500">Proofread, translate, or analyze your text</p>
          </div>
          <button id="check-gemini-btn" class="btn-secondary flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
            </svg>
            Check with Gemini AI
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-auto p-6">
        <div id="analysis-status" class="mb-4">
          <div class="text-sm text-gray-500">
            Type or paste Tamil text to get AI suggestions
          </div>
        </div>

        <div id="suggestions-container" class="space-y-3">
          <!-- Suggestions will appear here -->
        </div>
      </div>

      <div class="border-t border-gray-200 p-4 bg-gray-50">
        <div id="suggestions-summary"></div>
        <button id="accept-all-btn" class="btn-primary w-full mt-3">Accept All</button>
      </div>
    </div>
  </div>
</div>

<script src="/js/tamilDictionary.js?v=20251127b"></script>
<script src="/js/transliteration.js?v=20251127b"></script>
<script src="/js/tamilUtils.js?v=20251127b"></script>
<script src="/js/editor.js?v=20251127b"></script>
<script src="/js/suggestions.js?v=20251127b"></script>
<script src="/js/workspace.js?v=20251127b"></script>
</body>
</html>`

