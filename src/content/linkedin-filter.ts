// Content script for LinkedIn Silencer
// Monitors LinkedIn feed and filters AI hype posts

export {};

interface ClassificationResponse {
  decision: "FILTER" | "KEEP";
}

interface EnabledResponse {
  enabled: boolean;
}

interface OllamaResponse {
  available: boolean;
}

// Track processed posts to avoid duplicate processing
const processedPosts = new Set<string>();
const pendingPosts = new Set<string>();

// Debounce timer
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_DELAY = 500;

// Extension enabled state
let isEnabled = true;

// Inject styles for filtered posts
function injectStyles(): void {
  const styleId = "linkedin-silencer-styles";
  if (document.getElementById(styleId)) return;

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    .linkedin-silencer-filtered {
      position: relative;
      opacity: 0.4;
      transition: opacity 0.3s ease;
    }

    .linkedin-silencer-filtered:hover {
      opacity: 0.8;
    }

    .linkedin-silencer-overlay {
      position: absolute;
      top: 8px;
      right: 8px;
      background: rgba(0, 0, 0, 0.7);
      color: #fff;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      z-index: 100;
      pointer-events: none;
    }

    .linkedin-silencer-processing {
      position: absolute;
      top: 8px;
      right: 8px;
      background: rgba(0, 100, 200, 0.7);
      color: #fff;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      z-index: 100;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}

// Get post ID from element
function getPostId(element: Element): string | null {
  const dataId = element.getAttribute("data-id");
  if (dataId) return dataId;

  // Try to find data-urn attribute
  const urn = element.getAttribute("data-urn");
  if (urn) return urn;

  // Generate a hash from content as fallback
  const text = element.textContent || "";
  if (text.length > 50) {
    return `hash-${simpleHash(text.slice(0, 500))}`;
  }

  return null;
}

// Simple hash function for content-based ID
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Extract text content from a post
function extractPostText(element: Element): string {
  // Try multiple selectors for post content
  const selectors = [
    ".feed-shared-update-v2__description",
    ".feed-shared-text",
    ".feed-shared-inline-show-more-text",
    ".update-components-text",
    '[data-test-id="main-feed-activity-card__commentary"]',
    ".break-words",
  ];

  let text = "";

  for (const selector of selectors) {
    const contentElements = element.querySelectorAll(selector);
    for (const el of contentElements) {
      const elText = el.textContent?.trim() || "";
      if (elText.length > text.length) {
        text = elText;
      }
    }
  }

  // If still no text, get all text content but filter out noise
  if (!text) {
    // Get the main post area, excluding comments and reactions
    const mainContent =
      element.querySelector(".feed-shared-update-v2__description-wrapper") ||
      element.querySelector(".update-components-text") ||
      element;
    text = mainContent.textContent?.trim() || "";
  }

  // Clean up the text
  text = text
    .replace(/\s+/g, " ")
    .replace(/See more$/i, "")
    .replace(/See less$/i, "")
    .trim();

  return text;
}

// Apply filter styling to a post
function applyFilter(element: Element): void {
  element.classList.add("linkedin-silencer-filtered");

  // Remove processing indicator if present
  const processing = element.querySelector(".linkedin-silencer-processing");
  if (processing) processing.remove();

  // Add overlay if not already present
  if (!element.querySelector(".linkedin-silencer-overlay")) {
    const overlay = document.createElement("div");
    overlay.className = "linkedin-silencer-overlay";
    overlay.textContent = "Filtered: AI hype";

    // Make sure the post container is positioned for the overlay
    const computed = window.getComputedStyle(element);
    if (computed.position === "static") {
      (element as HTMLElement).style.position = "relative";
    }

    element.appendChild(overlay);
  }
}

// Remove filter styling from a post
function removeFilter(element: Element): void {
  element.classList.remove("linkedin-silencer-filtered");
  const overlay = element.querySelector(".linkedin-silencer-overlay");
  if (overlay) overlay.remove();
  const processing = element.querySelector(".linkedin-silencer-processing");
  if (processing) processing.remove();
}

// Show processing indicator
function showProcessing(element: Element): void {
  if (!element.querySelector(".linkedin-silencer-processing")) {
    const indicator = document.createElement("div");
    indicator.className = "linkedin-silencer-processing";
    indicator.textContent = "Analyzing...";

    const computed = window.getComputedStyle(element);
    if (computed.position === "static") {
      (element as HTMLElement).style.position = "relative";
    }

    element.appendChild(indicator);
  }
}

// Remove processing indicator
function removeProcessing(element: Element): void {
  const processing = element.querySelector(".linkedin-silencer-processing");
  if (processing) processing.remove();
}

// Classify a post using the background service worker
async function classifyPost(
  postId: string,
  text: string,
): Promise<"FILTER" | "KEEP"> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "classify",
      postId,
      text,
    })) as ClassificationResponse;
    return response.decision;
  } catch (error) {
    console.error("[LinkedIn Silencer] Classification error:", error);
    return "KEEP";
  }
}

// Process a single post
async function processPost(element: Element): Promise<void> {
  const postId = getPostId(element);
  if (!postId) return;

  // Skip if already processed or pending
  if (processedPosts.has(postId) || pendingPosts.has(postId)) return;

  // Extract text
  const text = extractPostText(element);
  if (text.length < 50) {
    // Skip very short posts (likely not main content)
    processedPosts.add(postId);
    return;
  }

  pendingPosts.add(postId);
  showProcessing(element);

  try {
    const decision = await classifyPost(postId, text);
    processedPosts.add(postId);
    pendingPosts.delete(postId);

    if (decision === "FILTER" && isEnabled) {
      applyFilter(element);
    } else {
      removeProcessing(element);
    }
  } catch (error) {
    console.error("[LinkedIn Silencer] Error processing post:", error);
    pendingPosts.delete(postId);
    removeProcessing(element);
  }
}

// Find all post elements in the feed
function findPosts(): Element[] {
  const selectors = [
    '[data-id^="urn:li:activity"]',
    '[data-urn^="urn:li:activity"]',
    ".feed-shared-update-v2",
    ".occludable-update",
  ];

  const posts: Element[] = [];
  const seen = new Set<Element>();

  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      if (!seen.has(el)) {
        seen.add(el);
        posts.push(el);
      }
    }
  }

  return posts;
}

// Process all visible posts
function processVisiblePosts(): void {
  if (!isEnabled) return;

  const posts = findPosts();

  // Process posts in batches to avoid overwhelming the API
  const unprocessedPosts = posts.filter((post) => {
    const postId = getPostId(post);
    return postId && !processedPosts.has(postId) && !pendingPosts.has(postId);
  });

  // Limit concurrent processing
  const batchSize = 3;
  const batch = unprocessedPosts.slice(0, batchSize);

  for (const post of batch) {
    processPost(post);
  }
}

// Debounced post processing
function debouncedProcessPosts(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    processVisiblePosts();
    debounceTimer = null;
  }, DEBOUNCE_DELAY);
}

// Update all filtered posts based on enabled state
function updateFilteredPosts(): void {
  const posts = findPosts();
  for (const post of posts) {
    const postId = getPostId(post);
    if (postId && processedPosts.has(postId)) {
      if (isEnabled && post.classList.contains("linkedin-silencer-filtered")) {
        // Already filtered, keep it
      } else if (!isEnabled) {
        // Disabled, remove all filters
        removeFilter(post);
      }
    }
  }
}

// Check extension enabled state
async function checkEnabled(): Promise<void> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "getEnabled",
    })) as EnabledResponse;
    isEnabled = response.enabled;
    updateFilteredPosts();
  } catch (error) {
    console.error("[LinkedIn Silencer] Error checking enabled state:", error);
  }
}

// Check if Ollama is available
async function checkOllama(): Promise<void> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "checkOllama",
    })) as OllamaResponse;

    if (!response.available) {
      console.warn(
        "[LinkedIn Silencer] Ollama is not running. Please start Ollama and ensure the gemma2:2b-instruct-q4_0 model is available.\n" +
          "Install: https://ollama.ai\n" +
          "Pull model: ollama pull gemma2:2b-instruct-q4_0",
      );
    } else {
      console.log("[LinkedIn Silencer] Ollama connection verified");
    }
  } catch (error) {
    console.warn("[LinkedIn Silencer] Could not check Ollama status:", error);
  }
}

// Set up MutationObserver to catch dynamically loaded posts
function setupObserver(): void {
  const observer = new MutationObserver((mutations) => {
    let hasNewPosts = false;

    for (const mutation of mutations) {
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) {
            // Check if this node or its children contain posts
            const postId = getPostId(node);
            if (postId || node.querySelector('[data-id^="urn:li:activity"]')) {
              hasNewPosts = true;
              break;
            }
          }
        }
      }
      if (hasNewPosts) break;
    }

    if (hasNewPosts) {
      debouncedProcessPosts();
    }
  });

  // Observe the main feed container
  const feedContainer =
    document.querySelector(".scaffold-finite-scroll") ||
    document.querySelector('[role="main"]') ||
    document.body;

  observer.observe(feedContainer, {
    childList: true,
    subtree: true,
  });

  console.log("[LinkedIn Silencer] MutationObserver set up");
}

// Listen for storage changes (enabled state updates from popup)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.enabled) {
    isEnabled = changes.enabled.newValue !== false;
    console.log(
      `[LinkedIn Silencer] Filtering ${isEnabled ? "enabled" : "disabled"}`,
    );

    if (!isEnabled) {
      // Remove all filters when disabled
      const posts = findPosts();
      for (const post of posts) {
        removeFilter(post);
      }
    } else {
      // Re-apply filters when enabled
      debouncedProcessPosts();
    }
  }
});

// Initialize
function init(): void {
  console.log("[LinkedIn Silencer] Initializing on LinkedIn feed...");

  injectStyles();
  checkEnabled();
  checkOllama();
  setupObserver();

  // Initial scan
  setTimeout(processVisiblePosts, 1000);

  // Also process on scroll (with debounce)
  let scrollTimer: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener(
    "scroll",
    () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        debouncedProcessPosts();
      }, 200);
    },
    { passive: true },
  );
}

// Only run on LinkedIn feed pages
if (
  window.location.hostname === "www.linkedin.com" &&
  window.location.pathname.startsWith("/feed")
) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
