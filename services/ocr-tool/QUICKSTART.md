# 🚀 QUICK START GUIDE

Get your OCR tool running in 5 minutes!

## ⚡ Installation (One-Time Setup)

### 1. Install System Requirements

**Ubuntu/Linux:**
```bash
sudo apt-get update
sudo apt-get install -y tesseract-ocr poppler-utils python3-pip
```

**macOS:**
```bash
brew install tesseract poppler python3
```

**Windows:**
- Download Python: https://www.python.org/downloads/
- Download Tesseract: https://github.com/UB-Mannheim/tesseract/wiki
- Download Poppler: https://github.com/oschwartz10612/poppler-windows/releases/

### 2. Install Python Packages

```bash
cd ocr-tool
pip install -r requirements.txt
```

That's it! ✅

## 🎯 Usage

### Method 1: Command Line (Simple)

```bash
# Extract text from image
python ocr_tool.py myimage.jpg

# Extract from PDF
python ocr_tool.py document.pdf -o extracted.docx
```

### Method 2: Web Interface (User-Friendly)

```bash
# Start server
python ocr_web_app.py

# Open browser to: http://localhost:5000
# Drag & drop your file
# Click "Extract Text"
# Download Word document
```

## 📝 Examples

### Example 1: Screenshot to Word
```bash
python ocr_tool.py screenshot.png
# Creates: screenshot_extracted.docx
```

### Example 2: Invoice PDF
```bash
python ocr_tool.py invoice.pdf -o invoice_text.docx
```

### Example 3: Multiple Images
```bash
for file in *.jpg; do
    python ocr_tool.py "$file"
done
```

## ⚠️ Common Issues

**"Tesseract not found"**
```bash
# Check if installed
tesseract --version

# If not, install it (see step 1 above)
```

**"No module named 'pytesseract'"**
```bash
pip install pytesseract
```

**"Poor accuracy"**
- Use clear, high-quality images
- Ensure text is not rotated
- Try increasing PDF DPI to 300+

## 💡 Pro Tips

1. **Better Quality:** Use 300 DPI for images
2. **PDFs:** Black text on white background = best results
3. **Speed:** Lower DPI = faster processing
4. **Languages:** Install language packs for non-English text

## 🎨 Web Interface Features

- ✅ Drag and drop
- ✅ Preview extracted text
- ✅ One-click download
- ✅ Beautiful UI
- ✅ Real-time processing
- ✅ Character count
- ✅ Error handling

## 📞 Need Help?

Check the full README.md for:
- Advanced usage
- Language support
- Customization options
- Troubleshooting guide
- API documentation

---

**Happy text extracting! 🎉**
