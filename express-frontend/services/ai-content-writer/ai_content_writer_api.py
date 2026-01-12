#!/usr/bin/env python3
"""
AI Content Writer API - ProofTamil.com
Generate blogs and essays in Tamil and English using OpenAI
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from openai import OpenAI
import json
from datetime import datetime

app = Flask(__name__)
CORS(app)

# Initialize OpenAI client
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# Configuration
SUPPORTED_LANGUAGES = ['tamil', 'english', 'bilingual']
CONTENT_TYPES = ['blog', 'essay', 'article', 'story']
TONES = ['professional', 'casual', 'academic', 'creative', 'persuasive']

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'AI Content Writer API',
        'version': '1.0.0'
    })

@app.route('/api/generate-content', methods=['POST'])
def generate_content():
    """
    Generate blog post or essay based on user prompt
    
    Expected JSON:
    {
        "prompt": "Write about AI in education",
        "language": "tamil" | "english" | "bilingual",
        "content_type": "blog" | "essay" | "article",
        "tone": "professional" | "casual" | "academic",
        "word_count": 500,
        "include_title": true,
        "include_meta": true
    }
    """
    try:
        data = request.json
        
        # Validate required fields
        if not data or 'prompt' not in data:
            return jsonify({'error': 'Prompt is required'}), 400
        
        prompt = data['prompt']
        language = data.get('language', 'english').lower()
        content_type = data.get('content_type', 'blog').lower()
        tone = data.get('tone', 'professional').lower()
        word_count = data.get('word_count', 500)
        include_title = data.get('include_title', True)
        include_meta = data.get('include_meta', False)
        
        # Validate inputs
        if language not in SUPPORTED_LANGUAGES:
            return jsonify({'error': f'Language must be one of: {SUPPORTED_LANGUAGES}'}), 400
        
        if content_type not in CONTENT_TYPES:
            return jsonify({'error': f'Content type must be one of: {CONTENT_TYPES}'}), 400
        
        # Build system prompt
        system_prompt = build_system_prompt(language, content_type, tone, word_count)
        
        # Build user prompt
        user_prompt = build_user_prompt(prompt, language, content_type, include_title, include_meta)
        
        # Generate content using OpenAI
        print(f"Generating {content_type} in {language}...")
        
        response = client.chat.completions.create(
            model="gpt-4",  # Use GPT-4 for best quality
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7,
            max_tokens=3000,
            top_p=1,
            frequency_penalty=0,
            presence_penalty=0
        )
        
        generated_content = response.choices[0].message.content
        
        # Parse the response to extract components
        parsed_content = parse_generated_content(generated_content, include_title, include_meta)
        
        return jsonify({
            'success': True,
            'content': parsed_content,
            'metadata': {
                'language': language,
                'content_type': content_type,
                'tone': tone,
                'word_count': len(generated_content.split()),
                'generated_at': datetime.now().isoformat(),
                'model': 'gpt-4'
            }
        })
        
    except Exception as e:
        print(f"Error generating content: {e}")
        return jsonify({
            'error': str(e),
            'message': 'Failed to generate content'
        }), 500

def build_system_prompt(language, content_type, tone, word_count):
    """Build system prompt based on parameters"""
    
    language_instructions = {
        'tamil': "Write ONLY in Tamil language using Tamil script (தமிழ்). Use proper Tamil grammar and vocabulary.",
        'english': "Write ONLY in English language. Use proper English grammar and vocabulary.",
        'bilingual': "Write in both Tamil and English. Provide Tamil content first, followed by English translation."
    }
    
    tone_instructions = {
        'professional': "Use professional, business-appropriate language.",
        'casual': "Use conversational, friendly tone.",
        'academic': "Use formal, scholarly language with proper citations and academic style.",
        'creative': "Use creative, engaging language with vivid descriptions.",
        'persuasive': "Use persuasive language to convince readers."
    }
    
    content_instructions = {
        'blog': "Write as a blog post with engaging introduction, body paragraphs, and conclusion.",
        'essay': "Write as a formal essay with thesis statement, supporting arguments, and conclusion.",
        'article': "Write as an informative article with clear sections and factual information.",
        'story': "Write as a narrative story with characters, plot, and engaging storytelling."
    }
    
    system_prompt = f"""You are a professional content writer for ProofTamil.com, specializing in creating high-quality {content_type}s.

Language: {language_instructions.get(language, '')}

Content Type: {content_instructions.get(content_type, '')}

Tone: {tone_instructions.get(tone, '')}

Target Length: Approximately {word_count} words.

Requirements:
1. Create engaging, well-structured content
2. Use proper grammar and punctuation
3. Include relevant examples and details
4. Make it informative and valuable
5. Ensure proper formatting with paragraphs
6. If Tamil, use proper Tamil Unicode characters
7. Keep the content original and plagiarism-free
8. Make it SEO-friendly with natural keyword usage"""

    return system_prompt

def build_user_prompt(prompt, language, content_type, include_title, include_meta):
    """Build user prompt"""
    
    user_prompt = f"Write a {content_type} about: {prompt}\n\n"
    
    if include_title:
        user_prompt += "Include a catchy title.\n"
    
    if include_meta:
        user_prompt += "Include meta description and keywords.\n"
    
    user_prompt += "\nFormat your response as follows:\n"
    
    if include_title:
        user_prompt += "TITLE: [Your title here]\n\n"
    
    if include_meta:
        user_prompt += "META_DESCRIPTION: [Brief description]\n\n"
        user_prompt += "KEYWORDS: [Comma-separated keywords]\n\n"
    
    user_prompt += "CONTENT:\n[Your main content here]"
    
    return user_prompt

def parse_generated_content(content, include_title, include_meta):
    """Parse the generated content into structured format"""
    
    result = {
        'title': '',
        'meta_description': '',
        'keywords': '',
        'content': content
    }
    
    if include_title:
        if 'TITLE:' in content:
            parts = content.split('TITLE:', 1)
            if len(parts) > 1:
                title_part = parts[1].split('\n', 1)
                result['title'] = title_part[0].strip()
                content = title_part[1] if len(title_part) > 1 else ''
    
    if include_meta:
        if 'META_DESCRIPTION:' in content:
            parts = content.split('META_DESCRIPTION:', 1)
            if len(parts) > 1:
                meta_part = parts[1].split('\n', 1)
                result['meta_description'] = meta_part[0].strip()
                content = meta_part[1] if len(meta_part) > 1 else content
        
        if 'KEYWORDS:' in content:
            parts = content.split('KEYWORDS:', 1)
            if len(parts) > 1:
                keywords_part = parts[1].split('\n', 1)
                result['keywords'] = keywords_part[0].strip()
                content = keywords_part[1] if len(keywords_part) > 1 else content
    
    if 'CONTENT:' in content:
        parts = content.split('CONTENT:', 1)
        if len(parts) > 1:
            content = parts[1].strip()
    
    result['content'] = content.strip()
    
    return result

@app.route('/api/improve-content', methods=['POST'])
def improve_content():
    """
    Improve existing content (proofreading, grammar check, enhancement)
    """
    try:
        data = request.json
        
        if not data or 'content' not in data:
            return jsonify({'error': 'Content is required'}), 400
        
        content = data['content']
        language = data.get('language', 'english').lower()
        improvement_type = data.get('improvement_type', 'grammar')  # grammar, enhance, simplify
        
        system_prompt = f"""You are a professional editor for ProofTamil.com.

Language: {language}

Task: {improvement_type}

Instructions:
- If grammar: Fix all grammatical errors, punctuation, and spelling
- If enhance: Improve writing quality, add vivid descriptions, better flow
- If simplify: Make content easier to understand, shorter sentences
- Maintain the original meaning and tone
- Keep the same language as input"""

        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Improve this content:\n\n{content}"}
            ],
            temperature=0.3,
            max_tokens=3000
        )
        
        improved_content = response.choices[0].message.content
        
        return jsonify({
            'success': True,
            'original': content,
            'improved': improved_content,
            'improvement_type': improvement_type,
            'language': language
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/translate', methods=['POST'])
def translate_content():
    """
    Translate content between Tamil and English
    """
    try:
        data = request.json
        
        if not data or 'content' not in data:
            return jsonify({'error': 'Content is required'}), 400
        
        content = data['content']
        from_lang = data.get('from_language', 'english')
        to_lang = data.get('to_language', 'tamil')
        
        system_prompt = f"""You are a professional translator for ProofTamil.com.

Translate from {from_lang} to {to_lang}.

Requirements:
- Maintain the original meaning and tone
- Use proper grammar in target language
- Preserve formatting (paragraphs, line breaks)
- Use culturally appropriate expressions
- If Tamil, use proper Unicode characters"""

        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Translate this:\n\n{content}"}
            ],
            temperature=0.3,
            max_tokens=3000
        )
        
        translated_content = response.choices[0].message.content
        
        return jsonify({
            'success': True,
            'original': content,
            'translated': translated_content,
            'from_language': from_lang,
            'to_language': to_lang
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Check for API key
    if not os.environ.get("OPENAI_API_KEY"):
        print("\n⚠️  WARNING: OPENAI_API_KEY environment variable not set!")
        print("Set it with: export OPENAI_API_KEY='your-api-key-here'\n")
    
    print("\n" + "="*70)
    print("🤖 AI Content Writer API - ProofTamil.com")
    print("="*70)
    print("\n📡 API running on: http://localhost:5002")
    print("\n📚 Endpoints:")
    print("   POST /api/generate-content - Generate blog/essay")
    print("   POST /api/improve-content - Improve existing content")
    print("   POST /api/translate - Translate Tamil ↔ English")
    print("\n⌨️  Press Ctrl+C to stop\n")
    
    app.run(debug=True, host='0.0.0.0', port=5002)
