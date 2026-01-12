# AI Content Writer Service

This directory contains the AI Content Writer service that generates high-quality blogs, essays, and articles in Tamil and English using OpenAI GPT-4.

## Files

- `ai_content_writer_api.py` - Python Flask API backend
- `requirements_ai_writer.txt` - Python dependencies
- `content-writer-service.js` - Node.js wrapper service

## Setup

### 1. Install Python Dependencies

```bash
cd express-frontend/services/ai-content-writer
pip install -r requirements_ai_writer.txt
```

### 2. Set OpenAI API Key

```bash
export OPENAI_API_KEY='your-api-key-here'
```

Or create a `.env` file:
```
OPENAI_API_KEY=your-api-key-here
```

### 3. Start the Python Flask API

```bash
python3 ai_content_writer_api.py
```

The API will run on `http://localhost:5002`

### 4. Configure Express Service

The service wrapper in `content-writer-service.js` will automatically connect to the Flask API.

Set environment variable if using a different port:
```bash
export AI_WRITER_API_URL=http://localhost:5002
```

## API Endpoints

The Express frontend provides these proxy endpoints:

- `GET /api/ai-content-writer/health` - Health check
- `POST /api/ai-content-writer/generate-content` - Generate new content
- `POST /api/ai-content-writer/improve-content` - Improve existing content
- `POST /api/ai-content-writer/translate` - Translate content

## Usage

Access the tool at: `/tools/ai-content-writer`

## Notes

- The Python Flask API must be running for the tool to work
- OpenAI API key is required
- Content generation may take 10-60 seconds depending on length
- Using GPT-4 for best quality (can be changed to GPT-3.5-turbo for lower cost)

