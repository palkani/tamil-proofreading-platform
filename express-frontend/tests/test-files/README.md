# Test Files Directory

This directory contains test files for running the ProofTamil tools test suite.

## Required Test Files

### For OCR Testing

1. **test-image.png** - A sample image file containing text (can be minimal 1x1 PNG for basic tests)
2. **test-document.pdf** - A sample PDF file containing text

### For Document Converter Testing

1. **test-tamil.txt** - A text file containing Tamil text
2. **test-document.docx** - A sample DOCX file (optional, tests will skip if not found)

## Creating Test Files

### Minimal PNG Image

You can create a minimal PNG using any image editor or use the test script which creates one automatically.

### Minimal PDF

A minimal PDF can be created with:
```bash
echo "%PDF-1.4" > test-document.pdf
# Add minimal PDF structure
```

### Tamil Text File

Create `test-tamil.txt` with Tamil content:
```
விஜய் இன்று சிபிஐ முன்பு ஆஜராக உள்ளார்.
```

### DOCX File

Create a DOCX file using:
- Microsoft Word
- LibreOffice Writer
- Online DOCX generators

Or use the test script which creates a minimal DOCX programmatically.

## File Size Limits

- Images: Max 16MB
- PDFs: Max 16MB
- Documents: Max 50MB

## Notes

- Test files are automatically cleaned up after tests
- Files should contain actual content (not empty) for meaningful tests
- Tamil text files should use UTF-8 encoding

