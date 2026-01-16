# LinkedIn Silencer

A browser extension that filters low-quality AI/LLM hype posts from your LinkedIn feed using local AI classification via Ollama.

## How It Works

1. The extension monitors your LinkedIn feed for new posts
2. Post content is sent to a local Ollama instance for classification
3. Posts identified as low-quality AI hype are dimmed (opacity: 0.4)
4. Filtered posts show a subtle "Filtered: AI hype" overlay
5. Hover over filtered posts to see them more clearly

## What Gets Filtered

**FILTERED** - Low-quality AI hype:
- Generic "AI will change everything" statements without substance
- Pure engagement bait about ChatGPT/LLMs
- "I tried AI and..." posts with no actual insights
- Posts announcing basic ChatGPT usage as groundbreaking
- LinkedIn influencer AI hype with vague promises

**KEPT** - Quality content:
- Posts with specific technical details or code
- Actual project results with concrete metrics/case studies
- Thoughtful analysis or criticism of AI
- Posts NOT primarily about AI/LLMs
- Educational content with genuine depth

## Prerequisites

### 1. Install Ollama

**macOS:**
```bash
brew install ollama
```

**Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Windows:**
Download from [https://ollama.com/download](https://ollama.com/download)

### 2. Start Ollama and Pull the Model

```bash
# Start Ollama service (may start automatically)
ollama serve

# Pull the classification model
ollama pull gemma2:2b-instruct-q4_0
```

Verify it's running:
```bash
curl http://localhost:11434/api/tags
```

## Installation

### Build from Source

```bash
# Clone or download this repository
cd linkedin-silencer

# Install dependencies
npm install

# Build the extension
npm run build
```

### Load in Chrome

1. Open `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `dist` folder from this project

### Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file in the `dist` folder (e.g., `manifest.json`)

Note: Firefox temporary add-ons are removed when the browser closes. For permanent installation, the extension needs to be signed.

## Usage

1. Make sure Ollama is running with the gemma2 model
2. Navigate to [linkedin.com/feed](https://www.linkedin.com/feed)
3. Posts will be analyzed as they load
4. Click the extension icon to:
   - Toggle filtering on/off
   - Check Ollama connection status
   - Clear the classification cache

## Development

```bash
# Watch mode - rebuilds on file changes
npm run watch

# Clean build
npm run clean && npm run build
```

## Adjusting Filtering Sensitivity

To adjust what gets filtered, modify the classification prompt in `src/background/service-worker.ts`. Look for the `CLASSIFICATION_PROMPT` constant.

You can make filtering more aggressive by:
- Adding more specific patterns to the FILTER list
- Removing items from the KEEP list

Or less aggressive by:
- Being more specific about what should be filtered
- Adding more items to the KEEP list

After changes, rebuild with `npm run build` and reload the extension.

## Configuration

### Model Selection

The default model is `gemma2:2b-instruct-q4_0` - a small, fast model suitable for classification. To use a different model:

1. Pull the model: `ollama pull <model-name>`
2. Edit `MODEL` constant in `src/background/service-worker.ts`
3. Rebuild the extension

Recommended alternatives:
- `llama3.2:1b` - Faster but potentially less accurate
- `gemma2:9b-instruct-q4_0` - More accurate but slower

### Cache Settings

Classification results are cached to avoid re-classifying the same posts. Default settings in `src/background/service-worker.ts`:

- `MAX_CACHE_SIZE`: 1000 entries (oldest entries pruned when exceeded)
- Cache persists across browser sessions

Clear cache via the extension popup or manually in browser devtools:
```javascript
chrome.storage.local.remove('classification_cache')
```

## Troubleshooting

### "Ollama not running" in popup

1. Check Ollama is running: `curl http://localhost:11434/api/tags`
2. If not, start it: `ollama serve`
3. Ensure the model is pulled: `ollama pull gemma2:2b-instruct-q4_0`

### Posts not being filtered

1. Check browser console for `[LinkedIn Silencer]` messages
2. Verify Ollama connection in the popup
3. Try clearing the cache and reloading the page
4. Check if filtering is enabled in the popup

### Extension not loading

1. Ensure you loaded the `dist` folder, not `src`
2. Check for build errors: `npm run build`
3. Look for errors in `chrome://extensions/`

## Privacy

- All classification happens locally via Ollama
- No data is sent to external servers
- Post content stays on your machine
- Cache is stored locally in browser storage

## License

MIT
