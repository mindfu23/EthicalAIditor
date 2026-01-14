/**
 * Style Assets Service
 * 
 * Manages style guides, glossaries, writing rules, character profiles,
 * and world-building assets for consistent AI assistance.
 */

const API_BASE = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '';

/**
 * Asset types supported by the API
 */
export const AssetTypes = {
  STYLE_GUIDE: 'style_guide',
  GLOSSARY: 'glossary',
  RULE: 'rule',
  CHARACTER: 'character',
  WORLD: 'world',
};

/**
 * Get auth headers with tenant token
 */
function getAuthHeaders() {
  const token = localStorage.getItem('tenant_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
}

/**
 * List all style assets for the current tenant
 * 
 * @param {string} type - Optional: filter by asset type
 * @returns {Promise<object>} List of style assets
 */
export async function listStyleAssets(type = null) {
  try {
    const url = type 
      ? `${API_BASE}/api/styles?type=${encodeURIComponent(type)}`
      : `${API_BASE}/api/styles`;

    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to list assets' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[Styles] List error:', error);
    throw error;
  }
}

/**
 * Create or update a style asset
 * 
 * @param {object} asset - Asset data
 * @param {string} asset.asset_type - Type of asset (use AssetTypes)
 * @param {string} asset.name - Display name
 * @param {object} asset.content - Asset content (varies by type)
 * @param {number} asset.priority - Priority (higher = more important)
 * @param {boolean} asset.active - Whether to include in AI context
 * @param {string} asset.id - Optional: ID for updates
 * @returns {Promise<object>} Created/updated asset info
 */
export async function saveStyleAsset(asset) {
  try {
    const response = await fetch(`${API_BASE}/api/styles`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(asset),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to save asset' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[Styles] Save error:', error);
    throw error;
  }
}

/**
 * Delete a style asset
 * 
 * @param {string} assetId - ID of the asset to delete
 * @returns {Promise<object>} Deletion result
 */
export async function deleteStyleAsset(assetId) {
  try {
    const response = await fetch(`${API_BASE}/api/styles/${assetId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to delete asset' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[Styles] Delete error:', error);
    throw error;
  }
}

/**
 * Get compiled style context for LLM prompts
 * Returns all active style assets formatted for prompt injection
 * 
 * @returns {Promise<object>} Style context with structured and text formats
 */
export async function getStyleContext() {
  try {
    const response = await fetch(`${API_BASE}/api/styles/context`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get context' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[Styles] Context error:', error);
    // Return empty context on error - don't break the chat
    return { context: {}, prompt_context: '' };
  }
}

// ============================================================
// HELPER FUNCTIONS FOR COMMON ASSET TYPES
// ============================================================

/**
 * Create a style guide asset
 */
export function createStyleGuide(name, description, rules = []) {
  return saveStyleAsset({
    asset_type: AssetTypes.STYLE_GUIDE,
    name,
    content: { description, rules },
    priority: 10,
    active: true,
  });
}

/**
 * Create a glossary entry
 */
export function createGlossaryEntry(term, definition, usage = '') {
  return saveStyleAsset({
    asset_type: AssetTypes.GLOSSARY,
    name: term,
    content: { term, definition, usage },
    priority: 5,
    active: true,
  });
}

/**
 * Create a writing rule
 */
export function createWritingRule(name, rule, examples = []) {
  return saveStyleAsset({
    asset_type: AssetTypes.RULE,
    name,
    content: { rule, examples },
    priority: 8,
    active: true,
  });
}

/**
 * Create a character profile
 */
export function createCharacter(name, description, traits = [], relationships = []) {
  return saveStyleAsset({
    asset_type: AssetTypes.CHARACTER,
    name,
    content: { description, traits, relationships },
    priority: 3,
    active: true,
  });
}

/**
 * Create a world/setting entry
 */
export function createWorldEntry(name, description, details = {}) {
  return saveStyleAsset({
    asset_type: AssetTypes.WORLD,
    name,
    content: { description, ...details },
    priority: 2,
    active: true,
  });
}

/**
 * Import multiple assets from a JSON structure
 */
export async function importAssets(assets) {
  const results = [];
  for (const asset of assets) {
    try {
      const result = await saveStyleAsset(asset);
      results.push({ success: true, ...result });
    } catch (error) {
      results.push({ success: false, error: error.message, asset });
    }
  }
  return results;
}

/**
 * Export all assets as JSON
 */
export async function exportAssets() {
  const data = await listStyleAssets();
  return data.assets || [];
}

export default {
  AssetTypes,
  listStyleAssets,
  saveStyleAsset,
  deleteStyleAsset,
  getStyleContext,
  createStyleGuide,
  createGlossaryEntry,
  createWritingRule,
  createCharacter,
  createWorldEntry,
  importAssets,
  exportAssets,
};
