# 🔍 OCR Tool - Image to Text Converter

Extract text from images and PDFs, convert to Word format (.docx)

## ✨ Features

- ✅ Extract text from images (JPG, PNG, TIFF, BMP, GIF)
- ✅ Extract text from PDF documents
- ✅ Convert extracted text to Word format (.docx)
- ✅ Command-line interface (CLI)
- ✅ Web-based interface (GUI)
- ✅ Drag-and-drop file upload
- ✅ Support for multiple languages
- ✅ High accuracy OCR using Tesseract

## 📋 Requirements

- Python 3.7+
- Tesseract OCR
- Poppler (for PDF support)

## 🚀 Installation

### Step 1: Install System Dependencies

#### **Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y tesseract-ocr poppler-utils
```

#### **macOS:**
```bash
brew install tesseract poppler
```

#### **Windows:**
1. Download Tesseract: https://github.com/UB-Mannheim/tesseract/wiki
2. Download Poppler: https://github.com/oschwartz10612/poppler-windows/releases/
3. Add both to your PATH

### Step 2: Install Python Dependencies

```bash
pip install pillow pytesseract pdf2image python-docx flask
```

Or install from requirements file:
```bash
pip install -r requirements.txt
```

## 💻 Usage

### Option 1: Command-Line Tool

**Basic usage:**
```bash
python ocr_tool.py input_file.jpg
```

**Specify output file:**
```bash
python ocr_tool.py document.pdf -o extracted_text.docx
```

**Examples:**
```bash
# Extract from image
python ocr_tool.py screenshot.png

# Extract from PDF
python ocr_tool.py invoice.pdf -o invoice_text.docx

# Process TIFF image
python ocr_tool.py scan.tiff -o output.docx
```

### Option 2: Web Interface

**Start the web server:**
```bash
python ocr_web_app.py
```

**Then open your browser:**
```
http://localhost:5000
```

**Features:**
- Drag and drop files
- Real-time preview
- One-click download
- Beautiful UI

## 📁 File Support

| Format | Extension | Support |
|--------|-----------|---------|
| JPEG | .jpg, .jpeg | ✅ |
| PNG | .png | ✅ |
| PDF | .pdf | ✅ |
| TIFF | .tiff, .tif | ✅ |
| BMP | .bmp | ✅ |
| GIF | .gif | ✅ |

## 🌍 Language Support

By default, the tool uses English. To add more languages:

**Install language packs:**
```bash
# Ubuntu/Debian
sudo apt-get install tesseract-ocr-[lang]

# Example: Tamil
sudo apt-get install tesseract-ocr-tam

# Example: Spanish
sudo apt-get install tesseract-ocr-spa
```

**Use in your code:**
```python
# For Tamil
text = pytesseract.image_to_string(image, lang='tam')

# For multiple languages
text = pytesseract.image_to_string(image, lang='eng+tam')
```

## 🎯 Advanced Usage

### Improve OCR Accuracy

**1. Preprocess images:**
```python
from PIL import Image, ImageEnhance

# Open image
image = Image.open('input.jpg')

# Convert to grayscale
image = image.convert('L')

# Increase contrast
enhancer = ImageEnhance.Contrast(image)
image = enhancer.enhance(2)

# Perform OCR
text = pytesseract.image_to_string(image)
```

**2. Adjust DPI for PDFs:**
```python
# Higher DPI = better quality but slower
images = convert_from_path('document.pdf', dpi=600)
```

**3. Custom Tesseract config:**
```python
custom_config = r'--oem 3 --psm 6'
text = pytesseract.image_to_string(image, config=custom_config)
```

## 📊 Performance Tips

| Scenario | Recommendation |
|----------|---------------|
| Low quality images | Increase DPI to 300-600 |
| Handwritten text | Use `--psm 6` or `--psm 7` |
| Single word | Use `--psm 8` |
| Single character | Use `--psm 10` |
| Multiple columns | Use `--psm 1` |

## 🔧 Troubleshooting

### "Tesseract not found"
```bash
# Check if installed
tesseract --version

# Ubuntu: Install
sudo apt-get install tesseract-ocr

# Add to PATH (Windows)
setx PATH "%PATH%;C:\Program Files\Tesseract-OCR"
```

### "PDF conversion failed"
```bash
# Install poppler
sudo apt-get install poppler-utils

# macOS
brew install poppler
```

### "Poor OCR accuracy"
- Ensure image quality is good (300+ DPI)
- Use grayscale images
- Increase contrast
- Remove noise from image
- Use correct language pack

### "Out of memory"
- Process large PDFs page by page
- Reduce DPI (try 200-300)
- Process in batches

## 📦 Project Structure

```
ocr-tool/
│
├── ocr_tool.py              # Command-line tool
├── ocr_web_app.py           # Web interface
├── templates/
│   └── index.html           # Web UI template
├── requirements.txt         # Python dependencies
└── README.md               # This file
```

## 🎨 Customization

### Customize Word Document Styling

Edit `create_word_document()` function:

```python
def create_word_document(text, output_path, title="Extracted Text"):
    doc = Document()
    
    # Custom title style
    title_para = doc.add_paragraph()
    title_run = title_para.add_run(title)
    title_run.bold = True
    title_run.font.size = Pt(24)  # Change size
    title_run.font.color.rgb = RGBColor(0, 0, 255)  # Blue color
    
    # Custom body text
    para = doc.add_paragraph(text)
    para.style = 'Normal'
    
    # Add page numbers, headers, etc.
    
    doc.save(output_path)
```

### Add Image Preprocessing

```python
def preprocess_image(image_path):
    """Improve image quality before OCR"""
    image = Image.open(image_path)
    
    # Convert to grayscale
    image = image.convert('L')
    
    # Increase contrast
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(2.0)
    
    # Sharpen
    enhancer = ImageEnhance.Sharpness(image)
    image = enhancer.enhance(2.0)
    
    return image
```

## 🚀 Deployment

### Deploy Web App

**Using Heroku:**
```bash
# Create Procfile
echo "web: python ocr_web_app.py" > Procfile

# Deploy
git push heroku main
```

**Using Docker:**
```dockerfile
FROM python:3.9
RUN apt-get update && apt-get install -y tesseract-ocr poppler-utils
COPY . /app
WORKDIR /app
RUN pip install -r requirements.txt
CMD ["python", "ocr_web_app.py"]
```

## 📈 Future Enhancements

- [ ] Support for more languages
- [ ] Batch processing
- [ ] API endpoint
- [ ] Cloud storage integration
- [ ] Image preprocessing options
- [ ] Multiple output formats (TXT, PDF)
- [ ] OCR confidence scores
- [ ] Table extraction
- [ ] Layout preservation

## 🤝 Contributing

Contributions welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - feel free to use in your projects!

## 💡 Tips for Best Results

1. **Image Quality:** Use high-resolution images (300+ DPI)
2. **Contrast:** Black text on white background works best
3. **Orientation:** Ensure text is not rotated
4. **Language:** Install appropriate language pack
5. **File Size:** Keep images under 10MB for faster processing
6. **Format:** PNG works better than JPEG for screenshots

## 🆘 Support

Having issues? Check:
1. Tesseract is installed: `tesseract --version`
2. Poppler is installed: `pdftoppm -v`
3. Python packages are installed: `pip list`
4. File permissions are correct
5. Image quality is adequate

## 📞 Contact

For questions or issues, please open an issue on GitHub.

---

**Made with ❤️ for easy text extraction**
