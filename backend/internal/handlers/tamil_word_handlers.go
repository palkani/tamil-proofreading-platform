package handlers

import (
        "net/http"
        "strconv"
        "strings"

        "tamil-proofreading-platform/backend/internal/models"

        "github.com/gin-gonic/gin"
)

type AutocompleteRequest struct {
        Query string `json:"query" binding:"required"`
        Limit int    `json:"limit"`
}

type AutocompleteResponse struct {
        Suggestions []TamilSuggestion `json:"suggestions"`
        Source      string            `json:"source"` // "database", "ai", "cache"
}

type TamilSuggestion struct {
        TamilText       string `json:"tamil_text"`
        Transliteration string `json:"transliteration"`
        Frequency       int    `json:"frequency"`
        Category        string `json:"category"`
}

// AutocompleteTamil handles autocomplete requests for Tamil words
// GET /api/v1/autocomplete?query=sangam&limit=10
func (h *Handlers) AutocompleteTamil(c *gin.Context) {
        query := c.Query("query")
        if query == "" {
                c.JSON(http.StatusBadRequest, gin.H{"error": "Query parameter is required"})
                return
        }

        // Parse and validate limit parameter - increased default to 20 for better suggestions
        limit := 20
        if limitStr := c.Query("limit"); limitStr != "" {
                parsedLimit, err := strconv.Atoi(limitStr)
                if err == nil && parsedLimit > 0 && parsedLimit <= 500 {
                        limit = parsedLimit
                }
        }

        // Normalize query: lowercase and trim
        query = strings.ToLower(strings.TrimSpace(query))

        // Search database for matching words using prefix matching
        // Note: Storing transliteration in lowercase in DB for efficient indexed search
        var words []models.TamilWord
        
        // Use indexed prefix matching on transliteration column
        // Transliterations are stored lowercase, so we don't need LOWER()
        err := h.db.
                Where("transliteration LIKE ?", query+"%").
                Order("frequency DESC, user_confirmed DESC").
                Limit(limit).
                Find(&words).Error

        if err != nil {
                c.JSON(http.StatusInternalServerError, gin.H{"error": "Database query failed"})
                return
        }
        
        // Post-process to prioritize exact matches
        // Move exact match to front if found
        for i, word := range words {
                if word.Transliteration == query && i > 0 {
                        // Move exact match to front
                        words = append([]models.TamilWord{word}, append(words[:i], words[i+1:]...)...)
                        break
                }
        }

        // Convert to response format
        suggestions := make([]TamilSuggestion, 0, len(words))
        for _, word := range words {
                suggestions = append(suggestions, TamilSuggestion{
                        TamilText:       word.TamilText,
                        Transliteration: word.Transliteration,
                        Frequency:       word.Frequency,
                        Category:        string(word.Category),
                })
        }

        response := AutocompleteResponse{
                Suggestions: suggestions,
                Source:      "database",
        }

        c.JSON(http.StatusOK, response)
}

// AddTamilWord allows adding a new Tamil word to the database
// POST /api/v1/tamil-words
func (h *Handlers) AddTamilWord(c *gin.Context) {
        var req struct {
                TamilText          string   `json:"tamil_text" binding:"required"`
                Transliteration    string   `json:"transliteration" binding:"required"`
                AlternateSpellings []string `json:"alternate_spellings"`
                Frequency          int      `json:"frequency"`
                Category           string   `json:"category"`
                Meaning            string   `json:"meaning"`
                Source             string   `json:"source"`
        }

        if err := c.ShouldBindJSON(&req); err != nil {
                c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
                return
        }

        // Normalize transliteration to lowercase for consistency
        normalizedTranslit := strings.ToLower(req.Transliteration)
        
        // Check if word already exists (case-insensitive check)
        var existingWord models.TamilWord
        err := h.db.Where("transliteration = ?", normalizedTranslit).First(&existingWord).Error
        if err == nil {
                // Word exists, increment user_confirmed count
                h.db.Model(&existingWord).Update("user_confirmed", existingWord.UserConfirmed+1)
                c.JSON(http.StatusOK, gin.H{
                        "message": "Word already exists, confirmation count increased",
                        "word":    existingWord,
                })
                return
        }

        // Create new word
        alternateSpellings := ""
        if len(req.AlternateSpellings) > 0 {
                alternateSpellings = strings.Join(req.AlternateSpellings, ",")
        }

        word := models.TamilWord{
                TamilText:          req.TamilText,
                Transliteration:    normalizedTranslit,
                AlternateSpellings: alternateSpellings,
                Frequency:          req.Frequency,
                Category:           models.WordCategory(req.Category),
                Meaning:            req.Meaning,
                Source:             req.Source,
                UserConfirmed:      1,
                IsVerified:         req.Source == "manual",
        }

        if err := h.db.Create(&word).Error; err != nil {
                c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create word"})
                return
        }

        c.JSON(http.StatusCreated, gin.H{
                "message": "Tamil word added successfully",
                "word":    word,
        })
}

// ConfirmTamilWord increments the user_confirmed counter for a transliteration
// POST /api/v1/tamil-words/confirm
func (h *Handlers) ConfirmTamilWord(c *gin.Context) {
        var req struct {
                Transliteration string `json:"transliteration" binding:"required"`
                TamilText       string `json:"tamil_text" binding:"required"`
        }

        if err := c.ShouldBindJSON(&req); err != nil {
                c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
                return
        }

        // Find and update the word
        var word models.TamilWord
        err := h.db.Where("transliteration = ? AND tamil_text = ?", 
                strings.ToLower(req.Transliteration), req.TamilText).First(&word).Error
        
        if err != nil {
                // Word doesn't exist in database, we could add it
                c.JSON(http.StatusNotFound, gin.H{"error": "Word not found"})
                return
        }

        // Increment confirmation count
        word.UserConfirmed++
        if err := h.db.Save(&word).Error; err != nil {
                c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update word"})
                return
        }

        c.JSON(http.StatusOK, gin.H{
                "message": "Word confirmation recorded",
                "word":    word,
        })
}
