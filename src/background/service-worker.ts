// Background service worker for LinkedIn Silencer
// Handles Ollama API calls and caching

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'gemma2:2b-instruct-q4_0';
const MAX_CACHE_SIZE = 1000;
const CACHE_KEY = 'classification_cache';

interface ClassificationResult {
  postId: string;
  decision: 'FILTER' | 'KEEP';
  timestamp: number;
}

interface CacheData {
  [postId: string]: ClassificationResult;
}

interface ClassifyRequest {
  type: 'classify';
  postId: string;
  text: string;
}

interface ToggleRequest {
  type: 'getEnabled' | 'setEnabled';
  enabled?: boolean;
}

interface CheckOllamaRequest {
  type: 'checkOllama';
}

type MessageRequest = ClassifyRequest | ToggleRequest | CheckOllamaRequest;

const CLASSIFICATION_PROMPT = `You are a content classifier for LinkedIn posts. Classify the following post as either "FILTER" or "KEEP".

FILTER posts that are:
- Generic "AI will change everything" statements without substance
- Pure engagement bait about ChatGPT/LLMs
- "I tried AI and..." posts with no actual insights
- Posts announcing basic ChatGPT usage as if it's groundbreaking
- LinkedIn influencer AI hype with vague promises
- Predictions about AI replacing jobs without analysis
- "AI tip of the day" type low-effort content

KEEP posts that have:
- Specific technical details, code, or implementation insights
- Actual project results with concrete metrics or case studies
- Thoughtful analysis, criticism, or nuanced discussion
- Posts that are NOT primarily about AI/LLMs
- Educational content with genuine depth
- Personal experiences with specific learnings

Respond with ONLY "FILTER" or "KEEP" - nothing else.

Post to classify:
"""
{POST_TEXT}
"""`;

// Check if Ollama is available
async function checkOllamaAvailable(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:11434/api/tags', {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Get cached classification
async function getCachedClassification(postId: string): Promise<ClassificationResult | null> {
  try {
    const result = await chrome.storage.local.get(CACHE_KEY);

    const cache = (result[CACHE_KEY] as CacheData) || undefined;
    if (cache) {
      return cache[postId] || null;
    }
  } catch {}
  return null;
}

// Save classification to cache
async function saveToCache(result: ClassificationResult): Promise<void> {
  try {
    const storageResult = await chrome.storage.local.get(CACHE_KEY);
    const cache: CacheData =
      (storageResult[CACHE_KEY] as CacheData) || undefined;

    // Check cache size and prune if necessary
    const cacheKeys = Object.keys(cache);
    if (cacheKeys.length >= MAX_CACHE_SIZE) {
      // Remove oldest entries (by timestamp)
      const sorted = cacheKeys.sort((a, b) => cache[a].timestamp - cache[b].timestamp);
      const toRemove = sorted.slice(0, Math.floor(MAX_CACHE_SIZE / 4));
      for (const key of toRemove) {
        delete cache[key];
      }
    }

    cache[result.postId] = result;
    await chrome.storage.local.set({ [CACHE_KEY]: cache });
  } catch (error) {
    console.error('[LinkedIn Silencer] Cache save error:', error);
  }
}

// Classify a post using Ollama
async function classifyPost(postId: string, text: string): Promise<'FILTER' | 'KEEP'> {
  // Check cache first
  const cached = await getCachedClassification(postId);
  if (cached) {
    console.log(`[LinkedIn Silencer] Cache hit for ${postId}: ${cached.decision}`);
    return cached.decision;
  }

  // Truncate very long posts to avoid overwhelming the model
  const truncatedText = text.length > 2000 ? text.slice(0, 2000) + '...' : text;
  const prompt = CLASSIFICATION_PROMPT.replace('{POST_TEXT}', truncatedText);

  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 10,
        },
      }),
    });

    if (!response.ok) {
      console.error(`[LinkedIn Silencer] Ollama API error: ${response.status}`);
      return 'KEEP'; // Don't filter on API errors
    }

    const data = await response.json();
    const responseText = (data.response || '').trim().toUpperCase();

    // Parse response - look for FILTER or KEEP
    let decision: 'FILTER' | 'KEEP' = 'KEEP';
    if (responseText.includes('FILTER')) {
      decision = 'FILTER';
    } else if (responseText.includes('KEEP')) {
      decision = 'KEEP';
    }

    // Cache the result
    await saveToCache({
      postId,
      decision,
      timestamp: Date.now(),
    });

    console.log(`[LinkedIn Silencer] Classified ${postId}: ${decision}`);
    return decision;
  } catch (error) {
    console.error('[LinkedIn Silencer] Classification error:', error);
    return 'KEEP'; // Don't filter on errors
  }
}

// Get enabled state
async function getEnabled(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get('enabled');
    return result.enabled !== false; // Default to enabled
  } catch {
    return true;
  }
}

// Set enabled state
async function setEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ enabled });
}

// Message handler
chrome.runtime.onMessage.addListener(
  (
    request: MessageRequest,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    if (request.type === 'classify') {
      const classifyReq = request as ClassifyRequest;
      classifyPost(classifyReq.postId, classifyReq.text)
        .then((decision) => sendResponse({ decision }))
        .catch((error) => {
          console.error('[LinkedIn Silencer] Error:', error);
          sendResponse({ decision: 'KEEP' });
        });
      return true; // Will respond asynchronously
    }

    if (request.type === 'getEnabled') {
      getEnabled()
        .then((enabled) => sendResponse({ enabled }))
        .catch(() => sendResponse({ enabled: true }));
      return true;
    }

    if (request.type === 'setEnabled') {
      const toggleReq = request as ToggleRequest;
      setEnabled(toggleReq.enabled!)
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false }));
      return true;
    }

    if (request.type === 'checkOllama') {
      checkOllamaAvailable()
        .then((available) => sendResponse({ available }))
        .catch(() => sendResponse({ available: false }));
      return true;
    }

    return false;
  }
);

// Log startup
console.log('[LinkedIn Silencer] Service worker started');
