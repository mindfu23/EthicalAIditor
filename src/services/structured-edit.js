/**
 * Structured Edit Service
 * 
 * Provides structured edit responses with precise position-based changes.
 * Each edit includes start/end positions, replacement text, and reasoning.
 */

import { buildRAGContext } from './rag.js';
import { getStyleContext } from './styles.js';
import { createCompletionCache } from './cache.js';

const API_BASE = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '';
const CLOUD_RUN_URL = 'https://llm-api-1097587800570.us-central1.run.app';

// Cache for edit responses (shorter TTL as they're context-specific)
const editCache = createCompletionCache(600); // 10 minutes

/**
 * Edit intent types for different kinds of corrections
 */
export const EditIntent = {
  REWRITE_CLARITY: 'rewrite_clarity',
  GRAMMAR_FIX: 'grammar_fix',
  STYLE_CONFORM: 'style_conform',
  CONSISTENCY_CHECK: 'consistency_check',
  TONE_ADJUST: 'tone_adjust',
  STRUCTURE_IMPROVE: 'structure_improve',
};

/**
 * Get auth headers with tenant token
 */
function getAuthHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };
  const tenantData = localStorage.getItem('ethicalaiditor_tenant');
  if (tenantData) {
    try {
      const parsed = JSON.parse(tenantData);
      if (parsed.token) {
        headers['Authorization'] = `Bearer ${parsed.token}`;
      }
    } catch (e) {}
  }
  return headers;
}

/**
 * Parse structured edit response from LLM
 * Extracts changes array from various response formats
 */
function parseEditResponse(response, originalText) {
  // Try to find JSON in the response
  const jsonMatch = response.match(/\[[\s\S]*?\]/);
  if (jsonMatch) {
    try {
      const changes = JSON.parse(jsonMatch[0]);
      if (Array.isArray(changes)) {
        // Validate and enhance each change
        return changes.map((change, i) => ({
          id: `edit-${Date.now()}-${i}`,
          start: parseInt(change.start) || 0,
          end: parseInt(change.end) || 0,
          original: originalText.substring(change.start || 0, change.end || 0),
          replacement: change.replacement || change.text || '',
          reason: change.reason || change.explanation || 'Suggested edit',
          severity: change.severity || 'suggestion', // 'error', 'warning', 'suggestion'
          category: change.category || 'general',
        }));
      }
    } catch (e) {
      console.warn('[Edit] Failed to parse JSON:', e);
    }
  }

  // Fallback: try to extract suggestions from natural language response
  return extractSuggestionsFromText(response, originalText);
}

/**
 * Extract edit suggestions from natural language response
 * Handles responses that describe changes without JSON format
 */
function extractSuggestionsFromText(response, originalText) {
  const suggestions = [];
  const lowerOriginal = originalText.toLowerCase();

  // Look for quoted text that should be changed
  const quotePattern = /"([^"]+)"\s*(?:should be|could be|change to|replace with|→|->)\s*"([^"]+)"/gi;
  let match;
  while ((match = quotePattern.exec(response)) !== null) {
    const [, original, replacement] = match;
    const start = lowerOriginal.indexOf(original.toLowerCase());
    if (start !== -1) {
      suggestions.push({
        id: `edit-${Date.now()}-${suggestions.length}`,
        start,
        end: start + original.length,
        original,
        replacement,
        reason: 'AI suggested change',
        severity: 'suggestion',
        category: 'general',
      });
    }
  }

  // Look for "change X to Y" patterns
  const changePattern = /change\s+["']?([^"']+)["']?\s+to\s+["']?([^"'.]+)["']?/gi;
  while ((match = changePattern.exec(response)) !== null) {
    const [, original, replacement] = match;
    const start = lowerOriginal.indexOf(original.toLowerCase().trim());
    if (start !== -1 && !suggestions.some(s => s.start === start)) {
      suggestions.push({
        id: `edit-${Date.now()}-${suggestions.length}`,
        start,
        end: start + original.trim().length,
        original: original.trim(),
        replacement: replacement.trim(),
        reason: 'AI suggested change',
        severity: 'suggestion',
        category: 'general',
      });
    }
  }

  return suggestions;
}

/**
 * Request structured edits for a text selection
 * 
 * @param {string} text - The text to analyze
 * @param {string} intent - Edit intent (use EditIntent enum)
 * @param {object} options - Additional options
 * @returns {Promise<object>} Structured edit response
 */
export async function requestStructuredEdits(text, intent = EditIntent.REWRITE_CLARITY, options = {}) {
  const {
    manuscriptId = null,
    includeRAG = true,
    includeStyles = true,
    model = null,
  } = options;

  // Build context from RAG and style assets
  let contextParts = [];

  if (includeStyles) {
    try {
      const styleContext = await getStyleContext();
      if (styleContext.prompt_context) {
        contextParts.push(`[Style Guidelines]\n${styleContext.prompt_context}`);
      }
    } catch (e) {
      console.warn('[Edit] Failed to get style context:', e);
    }
  }

  if (includeRAG && manuscriptId) {
    try {
      const ragContext = await buildRAGContext(text.substring(0, 200), manuscriptId, { topK: 2 });
      if (ragContext) {
        contextParts.push(`[Related Content]\n${ragContext}`);
      }
    } catch (e) {
      console.warn('[Edit] Failed to get RAG context:', e);
    }
  }

  // Build the edit prompt
  const systemPrompt = buildEditPrompt(intent, contextParts.join('\n\n'));
  
  const userPrompt = `Analyze the following text and provide structured edits in JSON format.

Text to analyze:
---
${text}
---

Respond with a JSON array of edits. Each edit should have:
- "start": character position where the edit begins
- "end": character position where the edit ends
- "replacement": the suggested replacement text
- "reason": brief explanation for the edit
- "severity": "error", "warning", or "suggestion"
- "category": type of edit (e.g., "grammar", "style", "clarity")

Example format:
[
  {"start": 10, "end": 25, "replacement": "improved text", "reason": "Clearer wording", "severity": "suggestion", "category": "clarity"}
]

If no edits are needed, respond with: []`;

  try {
    // Check cache first
    const cacheKey = { intent, text: text.substring(0, 500), model };
    const cached = await editCache.get(cacheKey);
    if (cached) {
      console.log('[Edit] Using cached response');
      return cached;
    }

    // Call LLM for structured response
    const response = await fetch(`${CLOUD_RUN_URL}/chat`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        manuscriptContext: contextParts.join('\n\n'),
        intent,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status}`);
    }

    const data = await response.json();
    const llmResponse = data.text || data.response || '';

    // Parse the response into structured edits
    const changes = parseEditResponse(llmResponse, text);

    const result = {
      original_text: text,
      intent,
      changes,
      raw_response: llmResponse,
      timestamp: new Date().toISOString(),
    };

    // Cache the result
    try {
      await editCache.set(cacheKey, result);
    } catch (e) {}

    return result;

  } catch (error) {
    console.error('[Edit] Structured edit error:', error);
    throw error;
  }
}

/**
 * Build system prompt based on edit intent
 */
function buildEditPrompt(intent, additionalContext = '') {
  const basePrompt = 'You are an AI writing assistant specialized in providing precise, actionable edits.';
  
  const intentPrompts = {
    [EditIntent.REWRITE_CLARITY]: `${basePrompt} Focus on improving clarity and readability. Simplify complex sentences, remove ambiguity, and ensure the meaning is clear.`,
    
    [EditIntent.GRAMMAR_FIX]: `${basePrompt} Focus on grammar, spelling, and punctuation errors. Be precise about what's wrong and how to fix it.`,
    
    [EditIntent.STYLE_CONFORM]: `${basePrompt} Focus on conforming the text to the specified style guide. Ensure consistency in tone, formatting, and terminology.`,
    
    [EditIntent.CONSISTENCY_CHECK]: `${basePrompt} Focus on internal consistency. Check for contradictions, inconsistent terminology, and logical issues.`,
    
    [EditIntent.TONE_ADJUST]: `${basePrompt} Focus on adjusting the tone to be more appropriate for the target audience.`,
    
    [EditIntent.STRUCTURE_IMPROVE]: `${basePrompt} Focus on improving structure and flow. Suggest paragraph breaks, reordering, and transitions.`,
  };

  let prompt = intentPrompts[intent] || basePrompt;

  if (additionalContext) {
    prompt += `\n\nContext:\n${additionalContext}`;
  }

  prompt += `

Important rules:
1. Only suggest changes that genuinely improve the text
2. Preserve the author's voice and intent
3. Be specific about character positions (0-indexed)
4. Keep replacements concise
5. Explain your reasoning briefly`;

  return prompt;
}

/**
 * Apply structured edits to text
 * 
 * @param {string} text - Original text
 * @param {Array} changes - Array of edit objects from requestStructuredEdits
 * @returns {string} Text with edits applied
 */
export function applyEdits(text, changes) {
  // Sort changes by position (descending) to apply from end to start
  // This preserves position accuracy as we modify the string
  const sortedChanges = [...changes].sort((a, b) => b.start - a.start);

  let result = text;
  for (const change of sortedChanges) {
    if (change.start >= 0 && change.end <= result.length && change.start < change.end) {
      result = result.substring(0, change.start) + change.replacement + result.substring(change.end);
    }
  }

  return result;
}

/**
 * Preview edits by creating a diff-like representation
 * 
 * @param {string} text - Original text
 * @param {Array} changes - Array of edit objects
 * @returns {Array} Array of {type, text} segments for rendering
 */
export function previewEdits(text, changes) {
  if (!changes || changes.length === 0) {
    return [{ type: 'unchanged', text }];
  }

  // Sort by position (ascending) for preview
  const sortedChanges = [...changes].sort((a, b) => a.start - b.start);
  
  const segments = [];
  let pos = 0;

  for (const change of sortedChanges) {
    // Add unchanged text before this edit
    if (change.start > pos) {
      segments.push({
        type: 'unchanged',
        text: text.substring(pos, change.start),
      });
    }

    // Add the edit
    segments.push({
      type: 'deletion',
      text: change.original || text.substring(change.start, change.end),
      reason: change.reason,
    });
    segments.push({
      type: 'insertion',
      text: change.replacement,
      reason: change.reason,
    });

    pos = change.end;
  }

  // Add remaining unchanged text
  if (pos < text.length) {
    segments.push({
      type: 'unchanged',
      text: text.substring(pos),
    });
  }

  return segments;
}

/**
 * Get edit statistics
 */
export function getEditStats(changes) {
  return {
    total: changes.length,
    errors: changes.filter(c => c.severity === 'error').length,
    warnings: changes.filter(c => c.severity === 'warning').length,
    suggestions: changes.filter(c => c.severity === 'suggestion').length,
    categories: [...new Set(changes.map(c => c.category))],
  };
}

export default {
  EditIntent,
  requestStructuredEdits,
  applyEdits,
  previewEdits,
  getEditStats,
};
