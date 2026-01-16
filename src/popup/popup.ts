// Popup script for LinkedIn Silencer

interface EnabledResponse {
  enabled: boolean;
}

interface OllamaResponse {
  available: boolean;
}

const enableToggle = document.getElementById('enableToggle') as HTMLInputElement;
const toggleLabel = document.getElementById('toggleLabel') as HTMLSpanElement;
const ollamaIndicator = document.getElementById('ollamaIndicator') as HTMLSpanElement;
const ollamaStatus = document.getElementById('ollamaStatus') as HTMLSpanElement;
const clearCacheBtn = document.getElementById('clearCache') as HTMLButtonElement;

// Update toggle label based on state
function updateToggleLabel(enabled: boolean): void {
  toggleLabel.textContent = enabled ? 'Filtering enabled' : 'Filtering disabled';
}

// Check Ollama connection status
async function checkOllamaStatus(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'checkOllama',
    }) as OllamaResponse;

    if (response.available) {
      ollamaIndicator.className = 'status-indicator connected';
      ollamaStatus.textContent = 'Ollama connected';
    } else {
      ollamaIndicator.className = 'status-indicator disconnected';
      ollamaStatus.textContent = 'Ollama not running';
    }
  } catch {
    ollamaIndicator.className = 'status-indicator disconnected';
    ollamaStatus.textContent = 'Error checking Ollama';
  }
}

// Load current enabled state
async function loadEnabledState(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'getEnabled',
    }) as EnabledResponse;

    enableToggle.checked = response.enabled;
    updateToggleLabel(response.enabled);
  } catch {
    enableToggle.checked = true;
    updateToggleLabel(true);
  }
}

// Handle toggle change
enableToggle.addEventListener('change', async () => {
  const enabled = enableToggle.checked;
  updateToggleLabel(enabled);

  try {
    await chrome.runtime.sendMessage({
      type: 'setEnabled',
      enabled,
    });
  } catch (error) {
    console.error('Failed to update enabled state:', error);
  }
});

// Handle clear cache button
clearCacheBtn.addEventListener('click', async () => {
  try {
    await chrome.storage.local.remove('classification_cache');
    clearCacheBtn.textContent = 'Cache cleared!';
    setTimeout(() => {
      clearCacheBtn.textContent = 'Clear Cache';
    }, 2000);
  } catch (error) {
    console.error('Failed to clear cache:', error);
    clearCacheBtn.textContent = 'Error';
    setTimeout(() => {
      clearCacheBtn.textContent = 'Clear Cache';
    }, 2000);
  }
});

// Initialize popup
async function init(): Promise<void> {
  await Promise.all([
    loadEnabledState(),
    checkOllamaStatus(),
  ]);
}

init();
