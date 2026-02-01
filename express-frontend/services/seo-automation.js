/**
 * SEO Automation Service
 * Handles automatic SEO tasks like Google indexing, sitemap pinging, etc.
 */

const axios = require('axios');

// Google Indexing API (requires setup in Google Cloud Console)
// See: https://developers.google.com/search/apis/indexing-api/v3/quickstart

/**
 * Ping search engines about sitemap updates
 * Call this after publishing a new blog post
 */
async function pingSitemapToSearchEngines() {
  const sitemapUrl = encodeURIComponent('https://prooftamil.com/sitemap.xml');
  
  const pingUrls = [
    // Google
    `https://www.google.com/ping?sitemap=${sitemapUrl}`,
    // Bing (also covers Yahoo)
    `https://www.bing.com/ping?sitemap=${sitemapUrl}`,
  ];

  const results = [];
  
  for (const url of pingUrls) {
    try {
      const response = await axios.get(url, { timeout: 10000 });
      results.push({ url, success: true, status: response.status });
      console.log(`[SEO] Pinged sitemap to: ${url} - Status: ${response.status}`);
    } catch (error) {
      results.push({ url, success: false, error: error.message });
      console.error(`[SEO] Failed to ping: ${url} - Error: ${error.message}`);
    }
  }
  
  return results;
}

/**
 * Generate SEO-optimized meta description from content
 * Uses first 155 characters of content, ending at a word boundary
 */
function generateMetaDescription(content, maxLength = 155) {
  if (!content) return '';
  
  // Clean up content
  let text = String(content)
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
  
  if (text.length <= maxLength) return text;
  
  // Cut at word boundary
  text = text.substring(0, maxLength);
  const lastSpace = text.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.8) {
    text = text.substring(0, lastSpace);
  }
  
  return text + '...';
}

/**
 * Generate URL-friendly slug from title
 */
function generateSlug(title, language = 'english') {
  if (!title) return 'post';
  
  let slug = String(title).toLowerCase().trim();
  
  // For Tamil titles, transliterate to English (basic)
  // This is a simplified version - for better results, use the transliteration API
  if (language === 'tamil') {
    // Keep only alphanumeric and spaces, replace spaces with hyphens
    slug = slug.replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
    if (!slug || slug === '-') {
      slug = 'tamil-post-' + Date.now();
    }
  } else {
    slug = slug.replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
  }
  
  // Remove consecutive hyphens and trim
  slug = slug.replace(/-+/g, '-').replace(/^-|-$/g, '');
  
  // Limit length
  if (slug.length > 100) {
    slug = slug.substring(0, 100).replace(/-$/, '');
  }
  
  return slug || 'post';
}

/**
 * Extract keywords from content using simple frequency analysis
 * For better results, use the AI content writer's keyword generation
 */
function extractKeywords(content, maxKeywords = 8) {
  if (!content) return [];
  
  // Common stop words to exclude
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
    'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
    'he', 'she', 'him', 'her', 'his', 'hers', 'we', 'us', 'our', 'you', 'your',
    'i', 'me', 'my', 'mine', 'myself', 'yourself', 'himself', 'herself', 'itself',
  ]);
  
  // Clean and tokenize
  const words = String(content)
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));
  
  // Count frequency
  const freq = {};
  for (const word of words) {
    freq[word] = (freq[word] || 0) + 1;
  }
  
  // Sort by frequency and return top keywords
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

/**
 * Generate Open Graph and Twitter Card meta tags
 */
function generateSocialMetaTags(options) {
  const {
    title = '',
    description = '',
    url = '',
    image = 'https://prooftamil.com/images/og-default.png',
    type = 'article',
    siteName = 'ProofTamil',
    twitterHandle = '@prooftamil',
  } = options;
  
  return {
    // Open Graph (Facebook, LinkedIn)
    'og:title': title,
    'og:description': description,
    'og:url': url,
    'og:image': image,
    'og:type': type,
    'og:site_name': siteName,
    'og:locale': 'ta_IN',
    
    // Twitter Card
    'twitter:card': 'summary_large_image',
    'twitter:title': title,
    'twitter:description': description,
    'twitter:image': image,
    'twitter:site': twitterHandle,
  };
}

/**
 * Calculate reading time for content
 */
function calculateReadingTime(content, wordsPerMinute = 200) {
  if (!content) return 1;
  
  const text = String(content).replace(/<[^>]*>/g, '');
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  const minutes = Math.ceil(wordCount / wordsPerMinute);
  
  return Math.max(1, minutes);
}

/**
 * Validate SEO requirements for a blog post
 */
function validateSEO(post) {
  const issues = [];
  const warnings = [];
  
  // Title checks
  if (!post.title) {
    issues.push('Missing title');
  } else if (post.title.length < 30) {
    warnings.push('Title is too short (< 30 chars) - aim for 50-60 chars');
  } else if (post.title.length > 60) {
    warnings.push('Title is too long (> 60 chars) - may be truncated in search results');
  }
  
  // Meta description checks
  if (!post.meta_description) {
    warnings.push('Missing meta description - will use content excerpt');
  } else if (post.meta_description.length < 120) {
    warnings.push('Meta description is short (< 120 chars) - aim for 150-160 chars');
  } else if (post.meta_description.length > 160) {
    warnings.push('Meta description is too long (> 160 chars) - may be truncated');
  }
  
  // Content checks
  if (!post.content_text) {
    issues.push('Missing content');
  } else if (post.content_text.length < 300) {
    warnings.push('Content is very short (< 300 chars) - longer content ranks better');
  }
  
  // Keywords check
  if (!post.keywords) {
    warnings.push('No keywords specified');
  }
  
  // Slug check
  if (!post.slug) {
    issues.push('Missing URL slug');
  } else if (post.slug.length > 75) {
    warnings.push('URL slug is long - shorter URLs are better for SEO');
  }
  
  return {
    isValid: issues.length === 0,
    score: Math.max(0, 100 - (issues.length * 25) - (warnings.length * 10)),
    issues,
    warnings,
  };
}

module.exports = {
  pingSitemapToSearchEngines,
  generateMetaDescription,
  generateSlug,
  extractKeywords,
  generateSocialMetaTags,
  calculateReadingTime,
  validateSEO,
};
