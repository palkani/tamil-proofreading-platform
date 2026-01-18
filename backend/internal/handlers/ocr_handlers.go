package handlers

import (
	"bytes"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func (h *Handlers) OCRHealth(c *gin.Context) {
	if strings.TrimSpace(h.cfg.OCRServiceURL) == "" {
		c.JSON(503, gin.H{
			"status": "unconfigured",
			"error":  "OCR_SERVICE_URL is not set on the backend",
		})
		return
	}
	c.JSON(200, gin.H{
		"status": "ok",
		"url":    h.cfg.OCRServiceURL,
	})
}

func (h *Handlers) OCRUpload(c *gin.Context) {
	ocrBase := strings.TrimSpace(h.cfg.OCRServiceURL)
	if ocrBase == "" {
		c.JSON(503, gin.H{
			"error":   "OCR is not configured on the backend.",
			"details": "Set OCR_SERVICE_URL on the Cloud Run backend service to your OCR microservice base URL.",
		})
		return
	}

	f, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(400, gin.H{"error": "No file uploaded"})
		return
	}
	defer f.Close()

	lang := c.PostForm("lang")
	if strings.TrimSpace(lang) == "" {
		lang = "eng+tam"
	}

	// Read file into memory (max 16MB enforced by upstream; still defensive here)
	data, err := io.ReadAll(io.LimitReader(f, 20*1024*1024))
	if err != nil {
		c.JSON(400, gin.H{"error": "Failed to read upload"})
		return
	}

	var body bytes.Buffer
	w := multipart.NewWriter(&body)

	part, err := w.CreateFormFile("file", header.Filename)
	if err != nil {
		_ = w.Close()
		c.JSON(500, gin.H{"error": "Failed to create upload payload"})
		return
	}
	if _, err := part.Write(data); err != nil {
		_ = w.Close()
		c.JSON(500, gin.H{"error": "Failed to write upload payload"})
		return
	}
	_ = w.WriteField("lang", lang)
	_ = w.Close()

	target, err := url.Parse(ocrBase)
	if err != nil {
		c.JSON(500, gin.H{"error": "Invalid OCR_SERVICE_URL"})
		return
	}
	target.Path = strings.TrimRight(target.Path, "/") + "/upload"

	req, err := http.NewRequest(http.MethodPost, target.String(), &body)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to create OCR request"})
		return
	}
	req.Header.Set("Content-Type", w.FormDataContentType())

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(502, gin.H{"error": fmt.Sprintf("OCR service unavailable: %v", err)})
		return
	}
	defer resp.Body.Close()

	// Pass through status + body (JSON expected)
	c.Status(resp.StatusCode)
	c.Header("Content-Type", resp.Header.Get("Content-Type"))
	_, _ = io.Copy(c.Writer, resp.Body)
}

func (h *Handlers) OCRDownload(c *gin.Context) {
	ocrBase := strings.TrimSpace(h.cfg.OCRServiceURL)
	if ocrBase == "" {
		c.JSON(503, gin.H{
			"error":   "OCR is not configured on the backend.",
			"details": "Set OCR_SERVICE_URL on the Cloud Run backend service to your OCR microservice base URL.",
		})
		return
	}

	filename := strings.TrimSpace(c.Param("filename"))
	if filename == "" {
		c.JSON(400, gin.H{"error": "filename is required"})
		return
	}

	target, err := url.Parse(ocrBase)
	if err != nil {
		c.JSON(500, gin.H{"error": "Invalid OCR_SERVICE_URL"})
		return
	}
	target.Path = strings.TrimRight(target.Path, "/") + "/download/" + url.PathEscape(filename)

	req, err := http.NewRequest(http.MethodGet, target.String(), nil)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to create download request"})
		return
	}

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(502, gin.H{"error": fmt.Sprintf("OCR service unavailable: %v", err)})
		return
	}
	defer resp.Body.Close()

	// Copy selected headers
	if cd := resp.Header.Get("Content-Disposition"); cd != "" {
		c.Header("Content-Disposition", cd)
	} else {
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	}
	if ct := resp.Header.Get("Content-Type"); ct != "" {
		c.Header("Content-Type", ct)
	}

	c.Status(resp.StatusCode)
	_, _ = io.Copy(c.Writer, resp.Body)
}


