# Tamil Word Cache Service

High-performance cache service for Tamil word autocomplete with < 70ms response time target.

## Features

- **Redis Cache**: Primary cache using Redis for fast lookups
- **In-Memory Fallback**: Memory cache as backup if Redis unavailable
- **Organized by First Letter**: Words indexed by first letter of transliteration for O(1) prefix lookups
- **Ranked Results**: Top N words sorted by frequency + user confirmations
- **Fast Response**: Target < 70ms response time

## Architecture

### Cache Structure

Words are organized by first letter of transliteration:
- Key format: `tamil:words:letter:{first_letter}`
- Example: `tamil:words:letter:a` contains all words starting with "a"
- Each letter cache contains up to 10,000 top-ranked words

### Ranking Algorithm

Words are ranked by:
```
rank = (frequency * 100) + (user_confirmed * 10)
```

Higher rank = better suggestion priority.

## Usage

### Initialization

The cache is automatically initialized on server startup in a background goroutine:

```go
tamilWordCache := tamil_word_cache.NewCacheService(db, redisURL)
// Cache preloads in background
```

### API Endpoint

**GET** `/api/v1/autocomplete?query={letter}&limit=5`

**Example:**
```bash
curl "http://localhost:8080/api/v1/autocomplete?query=a&limit=5"
```

**Response:**
```json
{
  "suggestions": [
    {
      "tamil_text": "அது",
      "transliteration": "athu",
      "frequency": 960,
      "category": "pronoun"
    },
    ...
  ],
  "source": "cache"
}
```

### Performance

- **Cache Hit**: < 20ms (Redis) or < 10ms (Memory)
- **Cache Miss**: Falls back to database (~50-100ms)
- **Target**: < 70ms total response time

## Configuration

### Environment Variables

- `REDIS_URL`: Redis connection URL (optional, falls back to memory cache)
- Cache TTL: 24 hours (configurable in code)

### Cache Refresh

Cache refreshes automatically on:
- Server restart
- Manual refresh via `RefreshCache()` method

## Implementation Details

### Cache Loading

1. Loads all Tamil words from database
2. Organizes by first letter of transliteration
3. Sorts each letter's words by rank (descending)
4. Limits to top 10,000 words per letter
5. Stores in Redis (if enabled) and memory

### Lookup Flow

1. Extract first letter from query
2. Try Redis cache first (if enabled)
3. Fall back to memory cache if Redis miss
4. Filter words by prefix match
5. Sort by exact match priority, then rank
6. Return top N results

### Fallback Strategy

If cache unavailable:
- Falls back to database query
- Still returns results (slower but functional)
- Logs performance warnings if > 70ms

## Monitoring

The service logs:
- Cache initialization time
- Slow lookups (> 50ms)
- Cache hit/miss statistics

## Future Enhancements

- [ ] Multi-letter prefix caching (e.g., "ab", "abc")
- [ ] Cache warming on startup
- [ ] Metrics export (Prometheus)
- [ ] Cache invalidation on word updates
