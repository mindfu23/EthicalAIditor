/**
 * Manuscript Store for EthicalAIditor
 * 
 * Local-first storage using IndexedDB for manuscript persistence.
 * Manuscripts stay local until user signs up and chooses to sync.
 */

const DB_NAME = 'ethicalaiditor';
const DB_VERSION = 1;
const STORE_NAME = 'manuscripts';

let dbPromise = null;

/**
 * Initialize the IndexedDB database
 */
function getDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create manuscripts store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('title', 'title', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
  });

  return dbPromise;
}

/**
 * Save or update a manuscript
 * 
 * @param {Object} manuscript - { id, title, content, messages?, fileType? }
 * @returns {Promise<string>} - The manuscript ID
 */
export async function saveManuscript(manuscript) {
  const db = await getDB();
  const now = Date.now();

  const record = {
    id: manuscript.id || `manuscript-${now}`,
    title: manuscript.title || 'Untitled',
    content: manuscript.content || '',
    messages: manuscript.messages || [],
    fileType: manuscript.fileType || 'txt',
    size: (manuscript.content || '').length,
    createdAt: manuscript.createdAt || now,
    updatedAt: now,
    synced: false, // Local-only until synced to cloud
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(record);

    request.onsuccess = () => resolve(record.id);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Load a manuscript by ID
 * 
 * @param {string} id - The manuscript ID
 * @returns {Promise<Object|null>} - The manuscript or null if not found
 */
export async function loadManuscript(id) {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all manuscripts, sorted by most recently updated
 * 
 * @returns {Promise<Array>} - Array of manuscripts
 */
export async function getAllManuscripts() {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('updatedAt');
    const request = index.getAll();

    request.onsuccess = () => {
      // Sort by updatedAt descending (most recent first)
      const results = request.result || [];
      results.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a manuscript by ID
 * 
 * @param {string} id - The manuscript ID
 * @returns {Promise<void>}
 */
export async function deleteManuscript(id) {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get manuscripts that haven't been synced to cloud
 * 
 * @returns {Promise<Array>} - Array of unsynced manuscripts
 */
export async function getUnsyncedManuscripts() {
  const all = await getAllManuscripts();
  return all.filter(m => !m.synced);
}

/**
 * Mark manuscripts as synced
 * 
 * @param {Array<string>} ids - Array of manuscript IDs to mark as synced
 * @returns {Promise<void>}
 */
export async function markAsSynced(ids) {
  const db = await getDB();

  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  for (const id of ids) {
    const request = store.get(id);
    request.onsuccess = () => {
      const manuscript = request.result;
      if (manuscript) {
        manuscript.synced = true;
        store.put(manuscript);
      }
    };
  }

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Sync manuscripts to cloud (placeholder for future implementation)
 * This will be called when user is authenticated and chooses to sync
 * 
 * @returns {Promise<{ uploaded: number, failed: number }>}
 */
export async function syncToCloud() {
  const API_BASE = import.meta.env.VITE_CLOUDFLARE_WORKER_URL;
  const userId = localStorage.getItem('ethicalaiditor_user_id');
  const token = localStorage.getItem('ethicalaiditor_auth_token');

  if (!API_BASE || !userId || !token) {
    console.log('[ManuscriptStore] Sync skipped - not authenticated or API not configured');
    return { uploaded: 0, failed: 0 };
  }

  const unsynced = await getUnsyncedManuscripts();
  
  if (unsynced.length === 0) {
    console.log('[ManuscriptStore] No manuscripts to sync');
    return { uploaded: 0, failed: 0 };
  }

  // TODO: Implement actual sync to Cloudflare D1
  // For now, just log that sync would happen
  console.log(`[ManuscriptStore] Would sync ${unsynced.length} manuscripts to cloud`);
  
  return { uploaded: 0, failed: 0 };
}

/**
 * Clear all local manuscripts (use with caution!)
 * 
 * @returns {Promise<void>}
 */
export async function clearAllManuscripts() {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
