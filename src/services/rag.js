/**
 * RAG (Retrieval-Augmented Generation) Service
 * 
 * Handles document embedding, chunk retrieval, and context building
 * for enhanced AI responses based on manuscript content.
 */

const API_BASE = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '';

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
 * Embed document content for RAG retrieval
 * Chunks the content and stores embeddings in Vectorize
 * 
 * @param {string} content - The document content to embed
 * @param {string} manuscriptId - Unique identifier for the manuscript
 * @param {object} options - Chunking options
 * @returns {Promise<object>} Embedding results with chunk IDs
 */
export async function embedDocument(content, manuscriptId, options = {}) {
  const { chunkSize = 500, overlap = 50 } = options;

  try {
    const response = await fetch(`${API_BASE}/api/rag/embed`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        content,
        manuscript_id: manuscriptId,
        chunk_size: chunkSize,
        overlap,
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Embedding failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[RAG] Embed error:', error);
    throw error;
  }
}

/**
 * Retrieve relevant chunks using semantic search
 * 
 * @param {string} query - The search query
 * @param {string} manuscriptId - Optional: filter to specific manuscript
 * @param {number} topK - Number of results to return
 * @returns {Promise<object>} Search results with relevant chunks
 */
export async function retrieveChunks(query, manuscriptId = null, topK = 5) {
  try {
    const response = await fetch(`${API_BASE}/api/rag/retrieve`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        query,
        manuscript_id: manuscriptId,
        top_k: topK,
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Retrieval failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[RAG] Retrieve error:', error);
    throw error;
  }
}

/**
 * Delete all chunks for a manuscript
 * 
 * @param {string} manuscriptId - The manuscript to delete chunks for
 * @returns {Promise<object>} Deletion result
 */
export async function deleteChunks(manuscriptId) {
  try {
    const response = await fetch(`${API_BASE}/api/rag/chunks`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({ manuscript_id: manuscriptId })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Delete failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[RAG] Delete error:', error);
    throw error;
  }
}

/**
 * Build RAG context for an LLM query
 * Retrieves relevant chunks and formats them for the prompt
 * 
 * @param {string} query - The user's query
 * @param {string} manuscriptId - Current manuscript ID
 * @param {object} options - Context building options
 * @returns {Promise<string>} Formatted context string for LLM prompt
 */
export async function buildRAGContext(query, manuscriptId, options = {}) {
  const { topK = 3, maxLength = 2000 } = options;

  try {
    const results = await retrieveChunks(query, manuscriptId, topK);
    
    if (!results.results || results.results.length === 0) {
      return '';
    }

    // Format retrieved chunks as context
    const contextParts = results.results.map((chunk, i) => {
      const preview = chunk.content.length > 300 
        ? chunk.content.substring(0, 300) + '...'
        : chunk.content;
      return `[Context ${i + 1}] ${preview}`;
    });

    let context = contextParts.join('\n\n');
    
    // Trim if too long
    if (context.length > maxLength) {
      context = context.substring(0, maxLength) + '...\n[Additional context truncated]';
    }

    return context;
  } catch (error) {
    console.error('[RAG] Build context error:', error);
    return ''; // Fail silently - RAG context is optional
  }
}

/**
 * Re-embed a manuscript when content changes
 * Deletes existing chunks and re-embeds with new content
 * 
 * @param {string} content - New document content
 * @param {string} manuscriptId - Manuscript identifier
 * @param {object} options - Embedding options
 * @returns {Promise<object>} Re-embedding results
 */
export async function reembedDocument(content, manuscriptId, options = {}) {
  // Delete existing chunks first
  try {
    await deleteChunks(manuscriptId);
  } catch (e) {
    // Ignore delete errors - may not exist
    console.log('[RAG] No existing chunks to delete');
  }

  // Embed new content
  return await embedDocument(content, manuscriptId, options);
}

/**
 * Check if a manuscript has been embedded
 * 
 * @param {string} manuscriptId - Manuscript to check
 * @returns {Promise<boolean>} Whether chunks exist for this manuscript
 */
export async function hasEmbeddings(manuscriptId) {
  try {
    // Try to retrieve any chunk - if we get results, embeddings exist
    const results = await retrieveChunks('test', manuscriptId, 1);
    return results.result_count > 0;
  } catch {
    return false;
  }
}

export default {
  embedDocument,
  retrieveChunks,
  deleteChunks,
  buildRAGContext,
  reembedDocument,
  hasEmbeddings,
};
